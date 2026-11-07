# 청약 도우미 (1단계: 앱 뼈대)

SH·LH 청약 공고를 모아 보여주고, 내 정보와 비교해 신청 가능한 공고를 알려주는 Windows 프로그램입니다.
이번 단계에는 아래가 들어 있습니다.

- 직접 그린 제목표시줄: **업데이트 | 최소화 | 최대화 | 닫기**, 창 크기 조절
- 로컬 프로필(로그인): 비밀번호 → Argon2id → 데이터 키를 감싸 저장, 개인정보는 XChaCha20-Poly1305로 암호화
- 관리자 승인 비밀번호 복구 (관리자 혼자서는 개인정보를 열 수 없음)
- 자동 잠금, 5회 오입력 시 대기 시간 증가
- 업데이트 버튼(서명 검증 후 설치) + GitHub Actions 배포 파이프라인
- 탭 4개 자리(내용은 2~5단계에서 채움)

## 폴더 구조

```
cheongyak-helper/
├─ src/                    화면 (React + TypeScript)
│  ├─ components/TitleBar.tsx   제목표시줄, 업데이트 버튼
│  └─ screens/              가입 · 로그인 · 복구 · 메인
├─ src-tauri/              Rust (암호화, 저장소, 복구, 업데이트)
│  ├─ src/crypto.rs         Argon2id, XChaCha20-Poly1305
│  ├─ src/profile.rs        프로필 파일 저장소
│  ├─ src/recovery.rs       관리자 승인 복구 (조각 A·B)
│  ├─ src/dpapi.rs          Windows DPAPI (조각 A 보관)
│  ├─ src/commands.rs       화면에서 부르는 명령
│  └─ admin_public_key.txt  관리자 공개키 (빌드 전에 채워야 함)
├─ admin-tool/             관리자 도구 (개발자 PC에서만 사용)
└─ .github/workflows/release.yml
```

## 처음 한 번만 할 일

### 1. 패키지 설치

```
cd cheongyak-helper
npm install
```

### 2. 관리자 키 만들기 (비밀번호 복구용)

```
cd admin-tool
cargo run --release -- keygen
```

- `admin_secret_key.txt`가 생깁니다. **USB 등에 오프라인으로 백업하고 Git에 올리지 마세요.** 잃어버리면 기존 사용자 전원의 복구가 불가능해집니다.
- 화면에 나온 공개키 한 줄을 `src-tauri/admin_public_key.txt`에 붙여넣습니다(`NOT_CONFIGURED`를 지우고).
- 공개키를 넣지 않고 빌드하면 앱은 동작하지만, 가입 시 "복구 설정 안 됨" 경고가 뜹니다.

### 3. 업데이트 서명 키 만들기

```
npm run tauri signer generate -- -w %USERPROFILE%\.tauri\cheongyak.key
```

- 출력된 **공개키**를 `src-tauri/tauri.conf.json`의 `plugins.updater.pubkey`에 넣습니다.
- 같은 파일의 `endpoints`에서 `OWNER/REPO`를 본인 GitHub 저장소로 바꿉니다. 배포용 저장소는 **공개**여야 앱이 업데이트를 받을 수 있습니다.
- 개인키 파일 내용과 비밀번호를 GitHub 저장소 Settings → Secrets → Actions에
  `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`로 등록합니다.

## 개발 실행

```
npm run tauri dev
```

## 설치파일 만들기

- 직접: `npm run tauri build` → `src-tauri/target/release/bundle/nsis/`에 설치파일이 생깁니다.
- 자동 배포: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`의 버전을 올린 뒤

  ```
  git tag v0.1.1
  git push origin v0.1.1
  ```

  GitHub Actions가 설치파일과 `latest.json`을 Release에 올립니다. 사용자는 업데이트 버튼만 누르면 됩니다.
- 코드 서명 인증서가 없으면 처음 설치할 때 SmartScreen 경고가 뜹니다. "추가 정보 → 실행"을 누르도록 지인에게 안내하세요.

## 비밀번호 복구 승인 (관리자)

1. 사용자가 앱의 "비밀번호를 잊었어요"에서 `REQ1.…` 코드를 복사해 보냅니다.
2. 본인인지 직접 확인합니다.
3. 개발자 PC에서:

   ```
   cd admin-tool
   cargo run --release -- approve REQ1.받은코드
   ```

4. 출력된 `REC1.…` 코드를 사용자에게 보냅니다. 사용자가 입력하면 새 비밀번호가 설정되고, 쓴 코드는 바로 무효가 됩니다.

- 복구는 **가입한 그 PC, 그 Windows 계정**에서만 됩니다. PC를 바꾸거나 Windows를 다시 설치했다면 복구할 수 없습니다.
- `approvals.log`에는 누구의 복구를 언제 승인했는지만 남습니다.

## 데이터 위치

`%APPDATA%\kr.cheongyak.helper\profiles\<프로필ID>\`

- `meta.json`: 프로필 이름, 암호화 설정, 감싼 키, 복구 정보 (개인정보 값 없음)
- `vault.json`: 개인정보 전체 (암호화됨)
- 업데이트 직전 백업: `%APPDATA%\kr.cheongyak.helper\backups\`

## 테스트(npm test)

```
cd src-tauri
cargo test
```

---

## 2단계: 공고 수집 (SH·LH 탭)

구성: GitHub Actions가 30분마다 `feed-collector/collect.py`를 실행 → 공개 공고만 모아 `feed-data` 브랜치의 `notices.json`으로 게시 → 앱이 이 파일을 읽어 SH/LH 탭에 표시합니다. 개인정보는 이 경로에 전혀 오가지 않습니다(앱은 파일을 내려받기만 함).

### 설정 순서
1. **LH 인증키 발급**: data.go.kr 가입 → "한국토지주택공사_분양임대공고문 조회 서비스"(15058530) 활용신청 → 마이페이지에서 **일반 인증키** 복사.
2. **GitHub 저장소**(공개)에 이 프로젝트를 올립니다(이미 업데이트용으로 만들었다면 같은 저장소).
3. 저장소 *Settings → Secrets and variables → Actions → New repository secret*: 이름 `LH_API_KEY`, 값은 1번 키.
4. *Actions → feed → Run workflow*로 한 번 실행 → 성공하면 `feed-data` 브랜치에 `notices.json`이 생깁니다.
5. `src/config.ts`의 `FEED_URL`에서 `OWNER/REPO`를 실제 값으로 바꿉니다. (바꾸기 전에는 샘플 데이터가 보입니다.)
6. `npm install`(opener 플러그인 추가됨) 후 `npm run tauri dev`.

### 주의
- 공개 저장소에서 60일 동안 활동이 없으면 GitHub이 예약 실행을 멈춥니다. 멈추면 Actions 화면에서 다시 켜거나 한 번 직접 실행하세요.
- SH 공고는 서울시 주택정보 포털(housing.seoul.go.kr)의 공고 표에서 읽습니다. 사이트 구조가 바뀌어 읽지 못하면 SH 탭 위에 경고가 뜨고 이전 목록을 유지합니다.
- 수집기 시험: `python -I -m unittest discover -s feed-collector/tests`
- 직접 실행: `set LH_API_KEY=키` 후 `python feed-collector/collect.py --out out/notices.json`

---

## 3단계: 내 정보 입력

- "나에게 맞는 공고" 탭에서 입력을 시작합니다. 9단계(기본·거주·세대·주택·소득·자산·청약통장·이력·추가/희망), 단계를 넘길 때마다 암호화되어 자동 저장됩니다.
- 모든 칸에 '모름'이 있고, 반복 항목(세대원·소유 주택·해외 체류·당첨 이력)은 '해당 없음'·'모름'을 고를 수 있습니다.
- '내 상황을 입력할 칸이 없어요' 버튼은 분류 이름만 암호화 저장소에 기록합니다(6단계의 주간 익명 통계에서 사용 예정).
- 설정 → 내 정보 백업: 로그인 비밀번호와 다른 '백업 비밀번호'로 암호화한 `.cyb` 파일을 만들고 복원합니다. 이 PC의 키와 무관하므로 PC를 바꿔도 복원됩니다.
- 입력 항목 정의는 `src/profile/schema.ts` 한 곳에 있고, 항목을 추가하려면 여기에 정의만 더하면 화면·통계에 반영됩니다.

## 4단계: 자격 판정 엔진 v1

- `src/engine/rules.json` — 기준 숫자(도시근로자 소득, 자산 한도, 통장 요건, 유형별 소득 비율). `verify: true`는 원문으로 재확인하지 못한 값입니다. 해마다 이 파일만 고치면 됩니다.
- `src/engine/engine.ts` — 내 정보 + 공고 → 일반공급/특별공급(신혼부부·신생아·생애최초·다자녀·노부모부양·기관추천)별 가능/불가/확인 필요와 근거. 기준일은 공고 게시일. 모름·빈 칸은 '확인 필요'.
- 임대·민영·신혼희망타운·토지/상가 공고는 아직 판정하지 않습니다(7단계에서 임대 추가).
- 공고별 예외는 `rules.json`의 `noticeOverrides`에 `"공고ID": { "disableTypes": ["다자녀"] }` 형식으로 넣습니다.
- 테스트(가상 프로필 21개): `npx tsx --test engine-tests/engine.test.ts`

## 5단계: 청약 가이드

공고를 클릭하면 `청약 가이드` 탭에 ① 신청 가능 유형과 근거(✔충족 ✖불충족 ?확인 필요) ② 추가로 확인할 항목 ③ 공고문에서 직접 확인할 것 ④ 준비 서류 ⑤ 전화 문의 질문이 나옵니다. 내용은 `src/engine/guide.ts`에서 고칩니다.

## 6단계: 주간 익명 통계

`src/report.ts`가 항목 이름과 상태(입력/모름/비어 있음)만 만들어 주 1회 `REPORT_URL`로 보냅니다(설정에서 끌 수 있고, 미리보기 가능). 받는 쪽은 `worker/`(Cloudflare Worker + D1)입니다. 배포 방법은 `worker/README.md`.

## 7단계: 임대 판정

`src/engine/rental.ts` — 행복주택(청년·대학생·신혼·한부모·고령자), 국민임대, 영구임대, 통합공공임대, 공공임대(5·10년), 매입·전세임대. 기준 숫자는 `rules.json`의 `rental`. 장기전세·민영·신혼희망타운은 아직 판정하지 않습니다.

## 전체 설정 순서

`SETUP.md`를 보세요(실제 공고 연결 → 자동 업데이트 → 통계 서버 → 배포 전 점검).
