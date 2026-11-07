//! Windows DPAPI: 현재 Windows 사용자 계정에 묶어서 암호화합니다.
//! 복구용 조각 A를 저장하는 데만 씁니다. 조각 A만으로는 아무것도 열 수 없습니다.

/// DPAPI에 추가로 넣는 앱 고유 값 (다른 프로그램이 같은 blob을 쉽게 풀지 못하게)
#[allow(dead_code)]
const ENTROPY: &[u8] = b"cheongyak-helper/recovery-share-a/v1";

#[cfg(windows)]
mod imp {
    use super::ENTROPY;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
    }

    unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        let v = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        let _ = LocalFree(HLOCAL(out.pbData as *mut core::ffi::c_void));
        v
    }

    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(data);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptProtectData(
                &input,
                PCWSTR::null(),
                Some(&entropy as *const CRYPT_INTEGER_BLOB),
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
            .map_err(|e| e.to_string())?;
            Ok(take(out))
        }
    }

    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(data);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptUnprotectData(
                &input,
                None,
                Some(&entropy as *const CRYPT_INTEGER_BLOB),
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
            .map_err(|_| "이 PC/Windows 계정에서 만든 복구 정보가 아닙니다.".to_string())?;
            Ok(take(out))
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn protect(_data: &[u8]) -> Result<Vec<u8>, String> {
        Err("Windows에서만 지원합니다.".into())
    }
    pub fn unprotect(_data: &[u8]) -> Result<Vec<u8>, String> {
        Err("Windows에서만 지원합니다.".into())
    }
}

pub use imp::{protect, unprotect};
