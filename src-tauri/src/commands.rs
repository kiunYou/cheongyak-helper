//! 화면(TypeScript)에서 호출하는 명령. 무거운 Argon2 계산이 화면을 멈추지 않도록 모두 async로 둡니다.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
use zeroize::Zeroizing;

use crate::crypto::{self, Key32, KdfParams};
use crate::error::{AppError, Result};
use crate::profile::{aad, now_secs, Meta, ProfileSummary, Settings, Store, META_VERSION};
use crate::recovery;

pub struct Session {
    pub profile_id: String,
    pub dek: Key32,
}

pub struct AppState {
    pub store: Store,
    pub session: Mutex<Option<Session>>,
}

impl AppState {
    pub fn new(store: Store) -> Self {
        Self { store, session: Mutex::new(None) }
    }

    fn set_session(&self, profile_id: String, dek: Key32) {
        *self.session.lock().unwrap() = Some(Session { profile_id, dek });
    }

    fn with_session<T>(&self, f: impl FnOnce(&Session) -> Result<T>) -> Result<T> {
        let guard = self.session.lock().unwrap();
        let session = guard.as_ref().ok_or(AppError::Locked)?;
        f(session)
    }
}

fn validate_name(name: &str) -> Result<String> {
    let name = name.trim().to_string();
    let len = name.chars().count();
    if len == 0 || len > 20 {
        return Err(AppError::Invalid("프로필 이름은 1~20자로 입력하세요.".into()));
    }
    Ok(name)
}

fn validate_password(password: &str) -> Result<()> {
    if password.chars().count() < 8 {
        return Err(AppError::Invalid("비밀번호는 8자 이상이어야 합니다.".into()));
    }
    Ok(())
}

fn unwrap_with_password(meta: &Meta, password: &str) -> Result<Option<Key32>> {
    let key = crypto::derive_password_key(password, &meta.kdf)?;
    Ok(crypto::open(&key, &meta.wrapped_dek_pw, &aad(&meta.id, "dek-pw"))
        .and_then(|plain| crypto::key_from_slice(&plain)))
}

fn rewrap_with_password(meta: &mut Meta, dek: &[u8; 32], password: &str) -> Result<()> {
    let kdf = KdfParams::new_default();
    let key = crypto::derive_password_key(password, &kdf)?;
    meta.wrapped_dek_pw = crypto::seal(&key, &dek[..], &aad(&meta.id, "dek-pw"))?;
    meta.kdf = kdf;
    Ok(())
}

fn empty_vault() -> Value {
    json!({ "schema": 1, "fields": {} })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateResult {
    pub profile: ProfileSummary,
    /// 관리자 승인 복구를 설정하지 못했을 때 그 이유 (화면에 경고로 표시)
    pub recovery_warning: Option<String>,
}

#[tauri::command]
pub async fn list_profiles(state: State<'_, AppState>) -> Result<Vec<ProfileSummary>> {
    state.store.list()
}

#[tauri::command]
pub async fn current_profile(state: State<'_, AppState>) -> Result<Option<ProfileSummary>> {
    let id = state.session.lock().unwrap().as_ref().map(|s| s.profile_id.clone());
    match id {
        Some(id) => Ok(Some(state.store.load_meta(&id)?.summary())),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn create_profile(
    state: State<'_, AppState>,
    name: String,
    password: String,
    notice_acknowledged: bool,
) -> Result<CreateResult> {
    if !notice_acknowledged {
        return Err(AppError::Invalid("안내 사항을 확인하고 체크해 주세요.".into()));
    }
    let name = validate_name(&name)?;
    validate_password(&password)?;
    if state.store.name_exists(&name)? {
        return Err(AppError::Invalid("같은 이름의 프로필이 이미 있습니다.".into()));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let dek = crypto::random_key();
    let kdf = KdfParams::new_default();
    let pw_key = crypto::derive_password_key(&password, &kdf)?;
    let wrapped_dek_pw = crypto::seal(&pw_key, &dek[..], &aad(&id, "dek-pw"))?;

    let (recovery, recovery_warning) = match recovery::setup(&dek, &id) {
        Ok(info) => (Some(info), None),
        Err(e) => (None, Some(e.to_string())),
    };

    let meta = Meta {
        version: META_VERSION,
        id: id.clone(),
        name,
        created_at: now_secs(),
        kdf,
        wrapped_dek_pw,
        recovery,
        failed_attempts: 0,
        locked_until: 0,
        settings: Settings::default(),
    };

    state.store.create_dir(&id)?;
    state.store.write_vault(&id, &dek, &empty_vault())?;
    state.store.save_meta(&meta)?;
    state.set_session(id, dek);

    Ok(CreateResult { profile: meta.summary(), recovery_warning })
}

#[tauri::command]
pub async fn unlock(
    state: State<'_, AppState>,
    profile_id: String,
    password: String,
) -> Result<ProfileSummary> {
    let mut meta = state.store.load_meta(&profile_id)?;
    meta.check_throttle()?;
    match unwrap_with_password(&meta, &password)? {
        Some(dek) => {
            meta.register_success();
            state.store.save_meta(&meta)?;
            state.set_session(meta.id.clone(), dek);
            Ok(meta.summary())
        }
        None => {
            meta.register_failure();
            state.store.save_meta(&meta)?;
            Err(AppError::WrongPassword)
        }
    }
}

#[tauri::command]
pub async fn lock(state: State<'_, AppState>) -> Result<()> {
    // Session이 버려질 때 데이터 키가 0으로 지워집니다 (Zeroizing)
    *state.session.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub async fn change_password(
    state: State<'_, AppState>,
    old_password: String,
    new_password: String,
) -> Result<()> {
    validate_password(&new_password)?;
    let id = state.with_session(|s| Ok(s.profile_id.clone()))?;
    let mut meta = state.store.load_meta(&id)?;
    meta.check_throttle()?;
    let dek = match unwrap_with_password(&meta, &old_password)? {
        Some(dek) => dek,
        None => {
            meta.register_failure();
            state.store.save_meta(&meta)?;
            return Err(AppError::WrongPassword);
        }
    };
    rewrap_with_password(&mut meta, &dek, &new_password)?;
    meta.register_success();
    state.store.save_meta(&meta)
}

/// 비밀번호를 잊었을 때: 관리자에게 보낼 복구 요청 코드
#[tauri::command]
pub async fn recovery_request(state: State<'_, AppState>, profile_id: String) -> Result<String> {
    let meta = state.store.load_meta(&profile_id)?;
    let info = meta.recovery.as_ref().ok_or_else(|| {
        AppError::RecoveryUnavailable("이 프로필은 가입할 때 복구 설정이 되지 않았습니다.".into())
    })?;
    recovery::request_code(&meta.id, &meta.name, info)
}

/// 관리자에게 받은 복구 코드로 새 비밀번호를 설정하고, 복구 조각을 새로 만듭니다.
#[tauri::command]
pub async fn recovery_apply(
    state: State<'_, AppState>,
    profile_id: String,
    code: String,
    new_password: String,
) -> Result<ProfileSummary> {
    validate_password(&new_password)?;
    let mut meta = state.store.load_meta(&profile_id)?;
    meta.check_throttle()?;
    let info = meta.recovery.clone().ok_or_else(|| {
        AppError::RecoveryUnavailable("이 프로필은 복구 설정이 없습니다.".into())
    })?;

    let dek = match recovery::recover_dek(&info, &code, &meta.id) {
        Ok(dek) => dek,
        Err(AppError::WrongRecoveryCode) => {
            meta.register_failure();
            state.store.save_meta(&meta)?;
            return Err(AppError::WrongRecoveryCode);
        }
        Err(e) => return Err(e),
    };

    rewrap_with_password(&mut meta, &dek, &new_password)?;
    // 한 번 쓴 복구 코드는 무효가 되도록 조각을 교체. 실패하면 기존 정보를 유지합니다.
    if let Ok(fresh) = recovery::setup(&dek, &meta.id) {
        meta.recovery = Some(fresh);
    }
    meta.register_success();
    state.store.save_meta(&meta)?;
    state.set_session(meta.id.clone(), dek);
    Ok(meta.summary())
}

#[tauri::command]
pub async fn load_personal_data(state: State<'_, AppState>) -> Result<Value> {
    state.with_session(|s| state.store.read_vault(&s.profile_id, &s.dek))
}

#[tauri::command]
pub async fn save_personal_data(state: State<'_, AppState>, data: Value) -> Result<()> {
    state.with_session(|s| state.store.write_vault(&s.profile_id, &s.dek, &data))
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings> {
    let id = state.with_session(|s| Ok(s.profile_id.clone()))?;
    Ok(state.store.load_meta(&id)?.settings)
}

#[tauri::command]
pub async fn set_settings(state: State<'_, AppState>, settings: Settings) -> Result<()> {
    let id = state.with_session(|s| Ok(s.profile_id.clone()))?;
    let mut meta = state.store.load_meta(&id)?;
    meta.settings = Settings {
        weekly_report: settings.weekly_report,
        auto_lock_minutes: settings.auto_lock_minutes.clamp(1, 120),
    };
    state.store.save_meta(&meta)
}

/// 업데이트 설치 직전: 잠그고 암호화된 파일을 그대로 백업
#[tauri::command]
pub async fn prepare_update(state: State<'_, AppState>) -> Result<()> {
    *state.session.lock().unwrap() = None;
    state.store.backup_all(&format!("pre-update-{}", now_secs()))?;
    Ok(())
}


// ───────────── 암호화 백업 (PC를 바꾸거나 Windows를 다시 설치할 때 쓰는 파일) ─────────────
// 백업 파일은 로그인 비밀번호와 별개의 "백업 비밀번호"로 암호화됩니다.
// 이 PC의 키(DPAPI 조각)와 무관하므로 다른 PC에서도 열 수 있습니다.

const BACKUP_AAD: &[u8] = b"cheongyak-helper:backup:v1";

#[derive(Serialize, Deserialize)]
struct BackupFile {
    v: u32,
    kdf: KdfParams,
    sealed: crypto::Sealed,
}

#[tauri::command]
pub async fn export_backup(state: State<'_, AppState>, backup_password: String) -> Result<String> {
    validate_password(&backup_password)?;
    let data = state.with_session(|s| state.store.read_vault(&s.profile_id, &s.dek))?;
    let plain = Zeroizing::new(serde_json::to_vec(&data)?);
    let kdf = KdfParams::new_default();
    let key = crypto::derive_password_key(&backup_password, &kdf)?;
    let sealed = crypto::seal(&key, &plain, BACKUP_AAD)?;
    Ok(serde_json::to_string(&BackupFile { v: 1, kdf, sealed })?)
}

/// 백업 파일을 열어 내용을 돌려줍니다. 저장은 화면에서 사용자가 확인한 뒤 save_personal_data로 합니다.
#[tauri::command]
pub async fn import_backup(state: State<'_, AppState>, text: String, backup_password: String) -> Result<Value> {
    state.with_session(|_| Ok(()))?; // 로그인된 상태에서만
    let file: BackupFile = serde_json::from_str(&text)
        .map_err(|_| AppError::Invalid("백업 파일 형식이 올바르지 않습니다.".into()))?;
    if file.v != 1 {
        return Err(AppError::Invalid("지원하지 않는 백업 버전입니다. 앱을 업데이트한 뒤 다시 시도하세요.".into()));
    }
    let key = crypto::derive_password_key(&backup_password, &file.kdf)?;
    let plain = crypto::open(&key, &file.sealed, BACKUP_AAD)
        .ok_or_else(|| AppError::Invalid("백업 비밀번호가 틀렸거나 파일이 손상되었습니다.".into()))?;
    Ok(serde_json::from_slice(&plain)?)
}
