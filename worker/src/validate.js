// 주간 익명 통계 검증: 허용된 항목 이름·상태만 통과시킵니다. 그 밖의 값(자유 텍스트 등)은 모두 거절합니다.
const STATUS = new Set(["answered", "unknown", "blank"]);
const WEEK = /^\d{4}-W\d{2}$/;

export function validateReport(body, allow) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "형식 오류" };
  const keys = Object.keys(body);
  for (const k of keys) if (!["v", "week", "completed", "fields", "slots"].includes(k)) return { ok: false, error: `허용되지 않은 키: ${k}` };
  if (body.v !== 1) return { ok: false, error: "버전 오류" };
  if (typeof body.week !== "string" || !WEEK.test(body.week)) return { ok: false, error: "주차 형식 오류" };
  if (typeof body.completed !== "boolean") return { ok: false, error: "completed 형식 오류" };
  if (!body.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) return { ok: false, error: "fields 형식 오류" };
  const fields = [];
  const allowF = new Set(allow.fields);
  for (const [k, v] of Object.entries(body.fields)) {
    if (!allowF.has(k)) return { ok: false, error: `허용되지 않은 항목: ${String(k).slice(0, 40)}` };
    if (typeof v !== "string" || !STATUS.has(v)) return { ok: false, error: "상태 값 오류" };
    fields.push([k, v]);
  }
  if (!Array.isArray(body.slots) || body.slots.length > 50) return { ok: false, error: "slots 형식 오류" };
  const allowS = new Set(allow.slots);
  for (const s of body.slots) if (typeof s !== "string" || !allowS.has(s)) return { ok: false, error: "허용되지 않은 분류" };
  return { ok: true, week: body.week, completed: body.completed, fields, slots: body.slots };
}
