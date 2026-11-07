// 앱의 입력 항목 정의에서 서버 허용 목록(worker/src/fields.json)을 만듭니다. 실행: npx tsx scripts/gen-report-fields.ts
import { writeFileSync } from "node:fs";
import { reportFieldKeys } from "../src/report";
import { SLOT_CATEGORIES } from "../src/profile/schema";

writeFileSync(new URL("../worker/src/fields.json", import.meta.url), JSON.stringify({ fields: reportFieldKeys(), slots: SLOT_CATEGORIES }, null, 2) + "\n");
console.log("worker/src/fields.json 갱신");
