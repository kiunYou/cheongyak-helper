// 청약 도우미 주간 익명 통계 수집 Worker (Cloudflare Workers + D1).
// 저장하는 것: 주차별 "항목 이름 × 상태(입력/모름/비어 있음)" 횟수, "입력할 칸이 없어요" 분류 횟수, 보고 건수.
// 저장하지 않는 것: IP, 사용자 식별자, 입력 값. (요청 헤더는 읽지 않습니다.)
import allow from "./fields.json";
import { validateReport } from "./validate.js";

const MAX_BYTES = 8 * 1024;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...extra } });

async function ingest(env, r) {
  const stmts = [
    env.DB.prepare("INSERT INTO reports(week, completed, n) VALUES(?1, ?2, 1) ON CONFLICT(week, completed) DO UPDATE SET n = n + 1").bind(r.week, r.completed ? 1 : 0),
    ...r.fields.map(([f, s]) => env.DB.prepare("INSERT INTO field_stats(week, field, status, n) VALUES(?1, ?2, ?3, 1) ON CONFLICT(week, field, status) DO UPDATE SET n = n + 1").bind(r.week, f, s)),
    ...r.slots.map((c) => env.DB.prepare("INSERT INTO slot_stats(week, category, n) VALUES(?1, ?2, 1) ON CONFLICT(week, category) DO UPDATE SET n = n + 1").bind(r.week, c)),
  ];
  await env.DB.batch(stmts);
}

async function stats(env, week) {
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).all().then((x) => x.results);
  return {
    week,
    reports: await q("SELECT completed, n FROM reports WHERE week = ?1", week),
    unknownOrBlank: await q("SELECT field, status, n FROM field_stats WHERE week = ?1 AND status != 'answered' ORDER BY n DESC", week),
    slots: await q("SELECT category, n FROM slot_stats WHERE week = ?1 ORDER BY n DESC", week),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/report" && request.method === "POST") {
      const text = await request.text();
      if (text.length > MAX_BYTES) return json({ error: "too large" }, 413, CORS);
      let body;
      try { body = JSON.parse(text); } catch { return json({ error: "bad json" }, 400, CORS); }
      const v = validateReport(body, allow);
      if (!v.ok) return json({ error: v.error }, 400, CORS);
      await ingest(env, v);
      return json({ ok: true }, 200, CORS);
    }

    // 관리자 조회: Authorization: Bearer <ADMIN_TOKEN>
    if (url.pathname === "/stats" && request.method === "GET") {
      const auth = request.headers.get("authorization") || "";
      if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: "unauthorized" }, 401);
      const week = url.searchParams.get("week") || "";
      if (!/^\d{4}-W\d{2}$/.test(week)) return json({ error: "week=YYYY-Www 필요" }, 400);
      return json(await stats(env, week));
    }
    return json({ error: "not found" }, 404);
  },
};
