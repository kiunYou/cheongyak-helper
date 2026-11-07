//! 관리자 승인 비밀번호 복구.
//!
//! 복구용 키 R = 조각 A XOR 조각 B
//! - 조각 A: 이 PC의 Windows 계정 보호 영역(DPAPI)에 저장
//! - 조각 B: 관리자 공개키로 봉인(sealed box)해서 이 PC에 저장. 관리자 개인키로만 풀림
//! - 데이터 키(DEK)는 R로도 감싸 둠
//!
//! 복구 흐름: 앱이 "복구 요청 코드"(봉인된 B 포함)를 보여줌 → 관리자가 B를 풀어 "복구 코드"로 돌려줌
//! → 앱이 A와 합쳐 R을 만들고 DEK를 꺼냄. 관리자는 B만 알고, B만으로는 아무것도 열 수 없음.

use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use crypto_box::PublicKey;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::crypto::{self, Key32, Sealed};
use crate::dpapi;
use crate::error::{AppError, Result};
use crate::profile::aad;

/// 빌드 시점에 포함되는 관리자 공개키 (admin-tool keygen으로 만든 값)
const ADMIN_PUBLIC_KEY: &str = include_str!("../admin_public_key.txt");

pub const REQUEST_PREFIX: &str = "REQ1.";
pub const CODE_PREFIX: &str = "REC1.";

#[derive(Clone, Serialize, Deserialize)]
pub struct RecoveryInfo {
    pub share_a_protected: String,
    pub share_b_sealed: String,
    pub wrapped_dek: Sealed,
}

/// 복구 요청 코드 안의 내용 (admin-tool과 형식을 맞춰야 함)
#[derive(Serialize, Deserialize)]
pub struct RequestPayload {
    pub v: u32,
    pub id: String,
    pub name: String,
    pub b: String,
}

fn admin_public_key() -> Result<PublicKey> {
    let unavailable =
        || AppError::RecoveryUnavailable("관리자 공개키가 설정되지 않은 빌드입니다.".into());
    let bytes = STANDARD.decode(ADMIN_PUBLIC_KEY.trim()).map_err(|_| unavailable())?;
    let arr: [u8; 32] = bytes.try_into().map_err(|_| unavailable())?;
    Ok(PublicKey::from(arr))
}

/// 새 복구 정보를 만듭니다. 가입할 때와 복구에 성공한 직후(조각 교체)에 호출합니다.
pub fn setup(dek: &[u8; 32], profile_id: &str) -> Result<RecoveryInfo> {
    let pk = admin_public_key()?;
    let r = crypto::random_key();
    let a = crypto::random_key();
    let b = crypto::xor32(&r, &a);

    let a_protected = dpapi::protect(&a[..]).map_err(AppError::RecoveryUnavailable)?;
    let b_sealed = pk
        .seal(&mut OsRng, &b[..])
        .map_err(|_| AppError::Crypto("복구 조각 봉인 실패".into()))?;
    let wrapped_dek = crypto::seal(&r, &dek[..], &aad(profile_id, "dek-rec"))?;

    Ok(RecoveryInfo {
        share_a_protected: STANDARD.encode(a_protected),
        share_b_sealed: STANDARD.encode(b_sealed),
        wrapped_dek,
    })
}

pub fn request_code(profile_id: &str, name: &str, info: &RecoveryInfo) -> Result<String> {
    let payload = RequestPayload {
        v: 1,
        id: profile_id.to_string(),
        name: name.to_string(),
        b: info.share_b_sealed.clone(),
    };
    Ok(format!("{REQUEST_PREFIX}{}", URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload)?)))
}

fn parse_recovery_code(code: &str) -> Result<Key32> {
    let cleaned: String = code.chars().filter(|c| !c.is_whitespace()).collect();
    let body = cleaned.strip_prefix(CODE_PREFIX).ok_or(AppError::WrongRecoveryCode)?;
    let bytes = Zeroizing::new(
        URL_SAFE_NO_PAD.decode(body).map_err(|_| AppError::WrongRecoveryCode)?,
    );
    crypto::key_from_slice(&bytes).ok_or(AppError::WrongRecoveryCode)
}

/// 복구 코드(조각 B)와 이 PC의 조각 A를 합쳐 데이터 키를 꺼냅니다.
pub fn recover_dek(info: &RecoveryInfo, code: &str, profile_id: &str) -> Result<Key32> {
    let b = parse_recovery_code(code)?;
    let a_protected = STANDARD
        .decode(&info.share_a_protected)
        .map_err(|_| AppError::Crypto("복구 정보 형식 오류".into()))?;
    let a_bytes = Zeroizing::new(dpapi::unprotect(&a_protected).map_err(AppError::RecoveryUnavailable)?);
    let a = crypto::key_from_slice(&a_bytes)
        .ok_or_else(|| AppError::Crypto("복구 조각 길이 오류".into()))?;
    let r = crypto::xor32(&a, &b);
    let dek = crypto::open(&r, &info.wrapped_dek, &aad(profile_id, "dek-rec"))
        .ok_or(AppError::WrongRecoveryCode)?;
    crypto::key_from_slice(&dek).ok_or(AppError::WrongRecoveryCode)
}
