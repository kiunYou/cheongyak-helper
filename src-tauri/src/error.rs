//! 화면에 그대로 보여줄 수 있는 오류 메시지. 개인정보 값은 절대 오류 메시지에 넣지 않습니다.

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("비밀번호가 올바르지 않습니다.")]
    WrongPassword,
    #[error("복구 코드가 올바르지 않습니다. 관리자에게 받은 코드를 그대로 붙여넣었는지 확인하세요.")]
    WrongRecoveryCode,
    #[error("시도가 너무 많습니다. {0}초 뒤에 다시 시도하세요.")]
    Throttled(u64),
    #[error("프로필을 찾을 수 없습니다.")]
    ProfileNotFound,
    #[error("잠겨 있습니다. 먼저 로그인하세요.")]
    Locked,
    #[error("{0}")]
    Invalid(String),
    #[error("암호화 처리 중 오류가 났습니다: {0}")]
    Crypto(String),
    #[error("관리자 승인 복구를 쓸 수 없습니다: {0}")]
    RecoveryUnavailable(String),
    #[error("파일을 읽거나 쓰지 못했습니다: {0}")]
    Io(#[from] std::io::Error),
    #[error("저장된 데이터 형식이 올바르지 않습니다: {0}")]
    Json(#[from] serde_json::Error),
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
