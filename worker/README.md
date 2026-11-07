# 주간 익명 통계 서버 (Cloudflare Worker)

앱이 주 1회 보내는 "어느 항목이 모름·비어 있었는지" 통계를 받는 작은 서버입니다. 무료 플랜으로 충분합니다.
저장하는 것: 주차별 항목 이름×상태 횟수, "입력할 칸이 없어요" 분류 횟수, 보고 건수. 저장하지 않는 것: IP, 식별자, 입력 값.
허용 목록(`src/fields.json`)에 없는 항목이나 상태 문자열이 아닌 값은 서버가 거절하므로, 앱에 실수가 있어도 개인정보 값이 저장되지 않습니다.

## 배포 (PC에서 한 번만)

1. https://dash.cloudflare.com 에서 무료 계정을 만듭니다.
2. 명령 프롬프트(cmd)에서 `cd worker` 로 이 폴더에 들어갑니다.
3. `npx wrangler login` — 브라우저에서 허용을 누릅니다.
4. `npx wrangler d1 create cheongyak-report` — 출력된 `database_id` 값을 `wrangler.toml`의 `REPLACE-WITH-YOUR-D1-ID` 자리에 붙여 넣습니다.
5. `npx wrangler d1 execute cheongyak-report --remote --file=schema.sql`
6. `npx wrangler secret put ADMIN_TOKEN` — 통계 조회용 비밀번호(길고 아무도 모르는 문자열)를 입력합니다.
7. `npx wrangler deploy` — 출력되는 주소(`https://cheongyak-report.<내서브도메인>.workers.dev`)를 복사합니다.
8. 앱의 `src/config.ts`에서 `REPORT_URL`을 `그 주소/report` 로 바꾸고 앱을 다시 빌드합니다.
   (`tauri.conf.json`의 CSP는 `https://*.workers.dev`를 이미 허용합니다.)

## 통계 보기

```
curl -H "Authorization: Bearer 내_ADMIN_TOKEN" "https://<주소>/stats?week=2026-W45"
```

"모름·비어 있음" 횟수가 많은 항목 순으로 나옵니다. 사용자가 어려워하는 항목(문구·안내를 고칠 후보)과, '입력할 칸이 없어요'가 많은 분류(항목을 추가할 후보)를 보는 용도입니다.

## 항목을 추가·변경했을 때

앱의 입력 항목(`src/profile/schema.ts`)을 바꾸면 허용 목록도 갱신해야 합니다: 프로젝트 루트에서 `npm run gen:fields` 후 `npx wrangler deploy`. 테스트(`npm test`)가 둘이 어긋나면 알려 줍니다.

## 남용 방지

Cloudflare 대시보드 → Security → WAF → Rate limiting에서 `/report` 경로에 IP당 분당 10회 같은 제한을 걸어 두세요(무료 플랜 가능).
