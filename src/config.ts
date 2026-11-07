// 공고 피드 주소. OWNER/REPO를 실제 GitHub 사용자·저장소 이름으로 바꾸세요.
// (feed 워크플로가 feed-data 브랜치에 notices.json을 게시합니다.)
// 바꾸기 전에는 화면 확인용 샘플 데이터가 표시됩니다.
export const FEED_URL = "https://raw.githubusercontent.com/OWNER/REPO/feed-data/notices.json";

// 피드를 다시 가져오는 간격(앱을 켜 둔 동안)
export const FEED_REFRESH_MS = 30 * 60 * 1000;

// 주간 익명 통계를 받는 Cloudflare Worker 주소. 배포 후 실제 주소로 바꾸세요(worker/README.md 참고).
// YOUR-가 들어 있는 동안에는 아무것도 전송하지 않습니다.
export const REPORT_URL = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/report";
