//! 청약 도우미 관리자 도구 (개발자 PC 전용)
//!
//! 사용법
//!   cheongyak-admin keygen
//!       관리자 키 쌍을 만듭니다. admin_secret_key.txt(개인키)는 USB 등에 오프라인 보관하고,
//!       화면에 나온 공개키를 src-tauri/admin_public_key.txt에 붙여넣은 뒤 앱을 빌드합니다.
//!   cheongyak-admin approve <복구 요청 코드>
//!       사용자에게 받은 REQ1.… 코드를 풀어 REC1.… 복구 코드를 만듭니다.
//!       개인키 위치는 ADMIN_SECRET_KEY_FILE 환경변수, 없으면 현재 폴더의 admin_secret_key.txt
//!
//! 이 도구가 다루는 것은 복구 조각 B뿐입니다. B만으로는 사용자의 개인정보를 열 수 없습니다.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use crypto_box::SecretKey;
use rand::rngs::OsRng;
use serde::Deserialize;

const REQUEST_PREFIX: &str = "REQ1.";
const CODE_PREFIX: &str = "REC1.";
const SECRET_FILE: &str = "admin_secret_key.txt";

#[derive(Deserialize)]
struct RequestPayload {
    v: u32,
    id: String,
    name: String,
    b: String,
}

fn secret_path() -> PathBuf {
    std::env::var("ADMIN_SECRET_KEY_FILE").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from(SECRET_FILE))
}

fn keygen() -> Result<(), String> {
    let path = secret_path();
    if path.exists() {
        return Err(format!(
            "{}가 이미 있습니다. 키를 바꾸면 기존 사용자 복구가 불가능해지므로 덮어쓰지 않습니다.",
            path.display()
        ));
    }
    let sk = SecretKey::generate(&mut OsRng);
    let pk = sk.public_key();
    fs::write(&path, STANDARD.encode(sk.to_bytes())).map_err(|e| e.to_string())?;
    println!("개인키를 저장했습니다: {}", path.display());
    println!("  → 오프라인(USB 등)에 백업하고, Git에는 절대 올리지 마세요.");
    println!();
    println!("공개키 (src-tauri/admin_public_key.txt에 이 한 줄만 붙여넣기):");
    println!("{}", STANDARD.encode(pk.as_bytes()));
    Ok(())
}

fn approve(request: &str) -> Result<(), String> {
    let cleaned: String = request.chars().filter(|c| !c.is_whitespace()).collect();
    let body = cleaned
        .strip_prefix(REQUEST_PREFIX)
        .ok_or("REQ1. 로 시작하는 복구 요청 코드가 아닙니다.")?;
    let json = URL_SAFE_NO_PAD.decode(body).map_err(|_| "요청 코드가 손상되었습니다.")?;
    let payload: RequestPayload = serde_json::from_slice(&json).map_err(|_| "요청 코드 형식 오류")?;
    if payload.v != 1 {
        return Err(format!("지원하지 않는 요청 버전: {}", payload.v));
    }

    let secret_b64 = fs::read_to_string(secret_path())
        .map_err(|_| format!("개인키 파일을 찾지 못했습니다: {}", secret_path().display()))?;
    let secret_bytes: [u8; 32] = STANDARD
        .decode(secret_b64.trim())
        .map_err(|_| "개인키 형식 오류")?
        .try_into()
        .map_err(|_| "개인키 길이 오류")?;
    let sk = SecretKey::from(secret_bytes);

    let sealed = STANDARD.decode(&payload.b).map_err(|_| "요청 코드 안의 복구 조각 형식 오류")?;
    let share_b = sk
        .unseal(&sealed)
        .map_err(|_| "이 관리자 키로 만든 요청이 아닙니다.")?;
    if share_b.len() != 32 {
        return Err("복구 조각 길이 오류".into());
    }

    println!("프로필 이름: {}", payload.name);
    println!("프로필 ID : {}", payload.id);
    println!();
    println!("본인 확인을 마쳤다면 아래 복구 코드를 사용자에게 전달하세요.");
    println!("{CODE_PREFIX}{}", URL_SAFE_NO_PAD.encode(&share_b));

    // 누구의 복구를 언제 승인했는지만 기록 (복구 코드는 기록하지 않음)
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    if let Ok(mut log) = OpenOptions::new().create(true).append(true).open("approvals.log") {
        let _ = writeln!(log, "{now}\t{}\t{}", payload.id, payload.name);
    }
    Ok(())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let result = match args.get(1).map(String::as_str) {
        Some("keygen") => keygen(),
        Some("approve") => match args.get(2) {
            Some(code) => approve(code),
            None => Err("사용법: cheongyak-admin approve <복구 요청 코드>".into()),
        },
        _ => Err("사용법: cheongyak-admin keygen | approve <복구 요청 코드>".into()),
    };
    if let Err(e) = result {
        eprintln!("오류: {e}");
        std::process::exit(1);
    }
}
