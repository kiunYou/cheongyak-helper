//! 암호화 기본 도구.
//! - 비밀번호 → 키: Argon2id
//! - 데이터 암호화·키 감싸기: XChaCha20-Poly1305 (AAD로 용도와 프로필 ID를 묶음)

use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    Key, XChaCha20Poly1305, XNonce,
};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::error::{AppError, Result};

/// 메모리에서 사라질 때 자동으로 0으로 지워지는 32바이트 키
pub type Key32 = Zeroizing<[u8; 32]>;

/// Argon2id 설정. 프로필마다 저장해 두므로 나중에 기본값을 올려도 기존 프로필이 열립니다.
#[derive(Clone, Serialize, Deserialize)]
pub struct KdfParams {
    pub salt: String,
    pub m_kib: u32,
    pub t: u32,
    pub p: u32,
}

impl KdfParams {
    pub fn new_default() -> Self {
        let mut salt = [0u8; 16];
        OsRng.fill_bytes(&mut salt);
        Self { salt: STANDARD.encode(salt), m_kib: 64 * 1024, t: 3, p: 1 }
    }
}

/// 암호문 묶음 (nonce + 암호문, base64)
#[derive(Clone, Serialize, Deserialize)]
pub struct Sealed {
    pub nonce: String,
    pub ct: String,
}

pub fn derive_password_key(password: &str, kdf: &KdfParams) -> Result<Key32> {
    let salt = STANDARD
        .decode(&kdf.salt)
        .map_err(|_| AppError::Crypto("salt 형식 오류".into()))?;
    let params = Params::new(kdf.m_kib, kdf.t, kdf.p, Some(32))
        .map_err(|e| AppError::Crypto(e.to_string()))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut out: Key32 = Zeroizing::new([0u8; 32]);
    argon
        .hash_password_into(password.as_bytes(), &salt, &mut out[..])
        .map_err(|e| AppError::Crypto(e.to_string()))?;
    Ok(out)
}

pub fn random_key() -> Key32 {
    let mut k: Key32 = Zeroizing::new([0u8; 32]);
    OsRng.fill_bytes(&mut k[..]);
    k
}

pub fn key_from_slice(bytes: &[u8]) -> Option<Key32> {
    if bytes.len() != 32 {
        return None;
    }
    let mut k: Key32 = Zeroizing::new([0u8; 32]);
    k.copy_from_slice(bytes);
    Some(k)
}

pub fn xor32(a: &[u8; 32], b: &[u8; 32]) -> Key32 {
    let mut out: Key32 = Zeroizing::new([0u8; 32]);
    for i in 0..32 {
        out[i] = a[i] ^ b[i];
    }
    out
}

pub fn seal(key: &[u8; 32], plaintext: &[u8], aad: &[u8]) -> Result<Sealed> {
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let mut nonce = [0u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let ct = cipher
        .encrypt(XNonce::from_slice(&nonce), Payload { msg: plaintext, aad })
        .map_err(|_| AppError::Crypto("암호화 실패".into()))?;
    Ok(Sealed { nonce: STANDARD.encode(nonce), ct: STANDARD.encode(ct) })
}

/// 키가 틀리거나 데이터가 변조되었으면 None
pub fn open(key: &[u8; 32], sealed: &Sealed, aad: &[u8]) -> Option<Zeroizing<Vec<u8>>> {
    let nonce = STANDARD.decode(&sealed.nonce).ok()?;
    let ct = STANDARD.decode(&sealed.ct).ok()?;
    if nonce.len() != 24 {
        return None;
    }
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    cipher
        .decrypt(XNonce::from_slice(&nonce), Payload { msg: &ct, aad })
        .ok()
        .map(Zeroizing::new)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_open_roundtrip() {
        let k = random_key();
        let s = seal(&k, b"hello", b"aad").unwrap();
        assert_eq!(&open(&k, &s, b"aad").unwrap()[..], b"hello");
        assert!(open(&k, &s, b"other-aad").is_none());
        assert!(open(&random_key(), &s, b"aad").is_none());
    }

    #[test]
    fn xor_split_recombines() {
        let r = random_key();
        let a = random_key();
        let b = xor32(&r, &a);
        assert_eq!(*xor32(&a, &b), *r);
    }

    #[test]
    fn password_key_is_deterministic() {
        let kdf = KdfParams { salt: STANDARD.encode([7u8; 16]), m_kib: 1024, t: 1, p: 1 };
        let a = derive_password_key("pw-12345678", &kdf).unwrap();
        let b = derive_password_key("pw-12345678", &kdf).unwrap();
        let c = derive_password_key("pw-different", &kdf).unwrap();
        assert_eq!(*a, *b);
        assert_ne!(*a, *c);
    }
}
