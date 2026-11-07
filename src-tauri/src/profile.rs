//! 로컬 프로필 저장소.
//!
//! %APPDATA%\kr.cheongyak.helper\profiles\<id>\
//!   meta.json   — 공개되어도 되는 정보: 이름, KDF 설정, 감싼 데이터 키, 복구 정보, 설정
//!   vault.json  — 개인정보 전체를 데이터 키로 암호화한 것

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use zeroize::Zeroizing;

use crate::crypto::{self, KdfParams, Sealed};
use crate::error::{AppError, Result};
use crate::recovery::RecoveryInfo;

pub const META_VERSION: u32 = 1;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// 주간 익명 리포트 자동 전송 (기본 켜짐, 가입 시 고지)
    pub weekly_report: bool,
    /// 미사용 자동 잠금 (분)
    pub auto_lock_minutes: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self { weekly_report: true, auto_lock_minutes: 10 }
    }
}

#[derive(Serialize, Deserialize)]
pub struct Meta {
    pub version: u32,
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub kdf: KdfParams,
    pub wrapped_dek_pw: Sealed,
    pub recovery: Option<RecoveryInfo>,
    #[serde(default)]
    pub failed_attempts: u32,
    #[serde(default)]
    pub locked_until: u64,
    #[serde(default)]
    pub settings: Settings,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    pub id: String,
    pub name: String,
    pub recovery_enabled: bool,
}

impl Meta {
    pub fn summary(&self) -> ProfileSummary {
        ProfileSummary {
            id: self.id.clone(),
            name: self.name.clone(),
            recovery_enabled: self.recovery.is_some(),
        }
    }

    pub fn check_throttle(&self) -> Result<()> {
        let now = now_secs();
        if self.locked_until > now {
            return Err(AppError::Throttled(self.locked_until - now));
        }
        Ok(())
    }

    /// 5회부터 30초, 60초, 120초 … 최대 15분 대기
    pub fn register_failure(&mut self) {
        self.failed_attempts += 1;
        if self.failed_attempts >= 5 {
            let exp = (self.failed_attempts - 5).min(5);
            let wait = (30u64 << exp).min(900);
            self.locked_until = now_secs() + wait;
        }
    }

    pub fn register_success(&mut self) {
        self.failed_attempts = 0;
        self.locked_until = 0;
    }
}

pub fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// 암호문을 용도와 프로필에 묶는 추가 인증 데이터
pub fn aad(profile_id: &str, purpose: &str) -> Vec<u8> {
    format!("cheongyak-helper:{purpose}:{profile_id}").into_bytes()
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

fn copy_dir(from: &Path, to: &Path) -> Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

pub struct Store {
    root: PathBuf,
}

impl Store {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self { root: app_data_dir }
    }

    fn profiles_dir(&self) -> PathBuf {
        self.root.join("profiles")
    }

    fn profile_dir(&self, id: &str) -> Result<PathBuf> {
        let valid = !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
        if !valid {
            return Err(AppError::ProfileNotFound);
        }
        Ok(self.profiles_dir().join(id))
    }

    pub fn create_dir(&self, id: &str) -> Result<()> {
        fs::create_dir_all(self.profile_dir(id)?)?;
        Ok(())
    }

    pub fn list(&self) -> Result<Vec<ProfileSummary>> {
        let dir = self.profiles_dir();
        if !dir.exists() {
            return Ok(vec![]);
        }
        let mut metas: Vec<Meta> = vec![];
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let id = entry.file_name().to_string_lossy().to_string();
            if let Ok(meta) = self.load_meta(&id) {
                metas.push(meta);
            }
        }
        metas.sort_by_key(|m| m.created_at);
        Ok(metas.iter().map(Meta::summary).collect())
    }

    pub fn name_exists(&self, name: &str) -> Result<bool> {
        Ok(self.list()?.iter().any(|p| p.name == name))
    }

    pub fn load_meta(&self, id: &str) -> Result<Meta> {
        let path = self.profile_dir(id)?.join("meta.json");
        if !path.exists() {
            return Err(AppError::ProfileNotFound);
        }
        Ok(serde_json::from_slice(&fs::read(path)?)?)
    }

    pub fn save_meta(&self, meta: &Meta) -> Result<()> {
        let path = self.profile_dir(&meta.id)?.join("meta.json");
        write_atomic(&path, &serde_json::to_vec_pretty(meta)?)
    }

    pub fn read_vault(&self, id: &str, dek: &[u8; 32]) -> Result<Value> {
        let path = self.profile_dir(id)?.join("vault.json");
        let sealed: Sealed = serde_json::from_slice(&fs::read(path)?)?;
        let plain = crypto::open(dek, &sealed, &aad(id, "vault"))
            .ok_or_else(|| AppError::Crypto("저장소를 열 수 없습니다.".into()))?;
        Ok(serde_json::from_slice(&plain)?)
    }

    pub fn write_vault(&self, id: &str, dek: &[u8; 32], data: &Value) -> Result<()> {
        let plain = Zeroizing::new(serde_json::to_vec(data)?);
        let sealed = crypto::seal(dek, &plain, &aad(id, "vault"))?;
        let path = self.profile_dir(id)?.join("vault.json");
        write_atomic(&path, &serde_json::to_vec(&sealed)?)
    }

    /// 업데이트 직전 백업. 파일은 이미 암호화된 상태 그대로 복사됩니다.
    pub fn backup_all(&self, label: &str) -> Result<Option<PathBuf>> {
        let src = self.profiles_dir();
        if !src.exists() {
            return Ok(None);
        }
        let dst = self.root.join("backups").join(label);
        copy_dir(&src, &dst)?;
        Ok(Some(dst))
    }
}
