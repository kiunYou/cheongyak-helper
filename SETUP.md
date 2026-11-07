# 청약 도우미 — 처음부터 끝까지 설정 가이드

앱을 "실제 공고 + 자동 업데이트 + 주간 통계" 상태로 만드는 순서입니다. 위에서부터 차례로 하면 됩니다.
(앱 실행·설치파일 만들기는 README.md의 앞부분을 먼저 끝낸 상태라고 가정합니다.)

## A. 실제 공고 연결 (가장 먼저)

지금은 샘플 공고만 보입니다. 아래를 하면 LH·SH 공고가 30분마다 자동으로 갱신됩니다.

1. **GitHub 저장소 만들기**: github.com에서 새 저장소(예: `cheongyak-helper`)를 만들고, 이 프로젝트 폴더를 올립니다(`git init` → `git add .` → `git commit` → `git push`). 비공개여도 되지만, 앱이 공고 파일을 읽으려면 **저장소가 공개(Public)** 여야 합니다. 공고 파일에는 개인정보가 전혀 없으니 안전합니다. 개인 소스가 부담되면 `feed-data` 브랜치만 공개하는 별도 공개 저장소를 하나 더 만들어도 됩니다.
2. **LH 공공데이터 키 받기**: https://www.data.go.kr 가입 → "한국토지주택공사_분양임대공고문 조회 서비스" 검색 → 활용신청 → 마이페이지에서 **일반 인증키(Encoding)** 복사. 승인까지 보통 즉시~1시간.
3. **키를 저장소에 등록**: GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret → 이름 `LH_API_KEY`, 값에 위 키.
4. **워크플로 실행**: 저장소 → Actions → `feed` → Run workflow. 성공하면 `feed-data` 브랜치에 `notices.json`이 생깁니다.
5. **앱에 주소 넣기**: `src/config.ts`의 `FEED_URL`에서 `OWNER/REPO`를 `내GitHub아이디/저장소이름`으로 바꾸고 앱을 다시 실행합니다. (`https://raw.githubusercontent.com/내아이디/저장소/feed-data/notices.json`을 브라우저로 열어 JSON이 보이면 정상입니다.)
6. **확인할 점**: SH 공고는 웹 페이지 구조를 읽는 방식이라, SH가 화면을 바꾸면 수집이 멈출 수 있습니다. 그때는 마지막 정상 결과가 유지되고 앱에 경고가 뜹니다(`feed-collector/collect.py`의 SH 파서 수정 필요). 공개 배포 전에 SH 사이트의 이용약관·robots.txt를 한번 확인하세요.

## B. 자동 업데이트(원클릭) 설정

1. 서명 키 만들기(PC에서 한 번): `npx tauri signer generate -w %USERPROFILE%\.tauri\cheongyak.key` — 비밀번호를 정하고 **키 파일과 비밀번호를 안전하게 보관**하세요(잃어버리면 기존 설치본이 새 버전으로 업데이트되지 않습니다).
2. 출력되는 **공개키 문자열**을 `src-tauri/tauri.conf.json`의 `pubkey`(`REPLACE_WITH_UPDATER_PUBLIC_KEY`)에 붙여 넣습니다.
3. `endpoints`의 `OWNER/REPO`도 내 저장소로 바꿉니다.
4. GitHub Secrets에 `TAURI_SIGNING_PRIVATE_KEY`(키 파일 내용 전체)와 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`를 등록합니다.
5. 새 버전 배포: `package.json`·`tauri.conf.json`의 version을 올리고 `git tag v0.2.0` → `git push --tags`. Actions의 `release`가 설치파일(.exe)과 `latest.json`을 만듭니다. 이후 사용자는 제목 표시줄의 업데이트 버튼 한 번으로 설치됩니다.

## C. 주간 익명 통계 서버

`worker/README.md`를 따라 Cloudflare Worker를 배포하고 `src/config.ts`의 `REPORT_URL`을 바꿉니다. 바꾸기 전에는 아무것도 전송되지 않습니다. 설정 화면의 "이번 주 보낼 내용 미리보기"로 실제 전송 내용을 사용자가 직접 볼 수 있습니다.

## D. 지인에게 배포하기 전

- **서명되지 않은 설치파일**은 Windows SmartScreen이 "알 수 없는 게시자" 경고를 띄웁니다. 지인에게는 "추가 정보 → 실행"을 안내하세요. 공개 배포 전에는 코드서명 인증서 구입을 권장합니다.
- **개인정보 처리 안내문**: 앱 가입 화면의 안내 문구(데이터는 이 PC에만 암호화 저장, 주간 통계는 항목 이름만, 끄기 가능)가 실제 동작과 일치하는지 한 번 더 읽어 보세요. 공개 배포하면 법률 검토를 받는 편이 안전합니다.
- **관리자 복구 도구**(`admin-tool`): 비밀번호 복구 요청 코드를 받으면 승인 코드를 만들어 주는 도구입니다. 관리자 개인키는 절대 저장소에 올리지 마세요.

## E. 판정 결과 신뢰도 점검

- `npm test` — 가상 프로필 40개 × 공고 12종 대량 점검을 포함한 자동 테스트(36개)와 통계 서버 검증 테스트(7개).
- 기준 숫자(소득표, 자산 한도, 통장 요건)는 `src/engine/rules.json` 한 파일에 모여 있고 `asOf`·`verify`가 표시되어 있습니다. 매년 초(통계청 소득표 갱신, 보통 2~3월)와 공고문이 바뀔 때 이 파일만 고치면 됩니다.
- 실제 공고 연결 후 **지난 공고 10~20건**에 대해 앱의 판정과 공고문 자격을 직접 비교해 보세요. 어긋나는 공고는 `rules.json`의 `noticeOverrides`에 `"공고ID": { "disableTypes": ["유형"] }`로 예외를 넣을 수 있습니다.
