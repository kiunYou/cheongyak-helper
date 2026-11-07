// 실행: node --test worker/test/worker.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateReport } from "../src/validate.js";

const allow = JSON.parse(readFileSync(new URL("../src/fields.json", import.meta.url), "utf8"));
const good = () => ({ v: 1, week: "2026-W45", completed: true, fields: { "basic.birth": "answered", "income.monthlyIncome": "unknown" }, slots: [allow.slots[0]] });

test("정상 보고 통과", () => assert.equal(validateReport(good(), allow).ok, true));
test("허용되지 않은 항목 거절", () => { const b = good(); b.fields["basic.name"] = "answered"; assert.equal(validateReport(b, allow).ok, false); });
test("값이 상태 문자열이 아니면 거절(개인정보 값 유입 차단)", () => { const b = good(); b.fields["basic.birth"] = "1992-01-01"; assert.equal(validateReport(b, allow).ok, false); });
test("추가 키 거절", () => { const b = { ...good(), name: "홍길동" }; assert.equal(validateReport(b, allow).ok, false); });
test("자유 텍스트 분류 거절", () => { const b = good(); b.slots = ["내 집 주소는 ..."]; assert.equal(validateReport(b, allow).ok, false); });
test("주차 형식 오류 거절", () => { const b = good(); b.week = "2026-45"; assert.equal(validateReport(b, allow).ok, false); });
test("허용 목록이 비어 있지 않음", () => assert.ok(allow.fields.length > 30 && allow.slots.length >= 9));
