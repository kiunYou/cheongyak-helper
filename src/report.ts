// 주간 익명 통계: "어느 항목이 모름·비어 있었는지"와 "입력할 칸이 없어요" 분류만 보냅니다.
// 이름·생년월일·금액 등 입력한 값, 세대원 수, 설치 식별자는 포함하지 않습니다. 설정에서 끌 수 있습니다.
import { REPORT_URL } from "./config";
import {
  ACCOUNT_DEFS, ASSET_DEFS, BASIC_DEFS, EXTRA_DEFS, HISTORY_DEFS, HOUSEHOLD_DEFS, HOUSING_DEFS, INCOME_DEFS,
  MEMBERS_DEF, RESIDENCE_DEFS, personsOf, type Def,
} from "./profile/schema";
import { UNKNOWN, type PersonalData, type Rec } from "./profile/types";

export type FieldStatus = "answered" | "unknown" | "blank";
export type Report = {
  v: 1;
  week: string; // 예: 2026-W45
  completed: boolean;
  fields: Record<string, FieldStatus>;
  slots: string[]; // '입력할 칸이 없어요' 분류 이름(중복 가능)
};

const LAST_SENT_KEY = "cheongyak-helper:report-last-week";

/** ISO 주차 문자열 */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

function statusOf(d: Def, rec: Rec): FieldStatus {
  const v = rec[d.key];
  if (v === UNKNOWN) return "unknown";
  if (d.type === "list") return Array.isArray(v) ? "answered" : "blank";
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0) ? "blank" : "answered";
}

const RANK: Record<FieldStatus, number> = { answered: 0, unknown: 1, blank: 2 };
function worse(a: FieldStatus | undefined, b: FieldStatus): FieldStatus {
  return a === undefined || RANK[b] > RANK[a] ? b : a;
}

type Group = { prefix: string; defs: Def[]; recs: () => { rec: Rec; isSelf: boolean }[] };

function groups(data: PersonalData): Group[] {
  const ps = personsOf(data);
  return [
    { prefix: "basic", defs: BASIC_DEFS, recs: () => [{ rec: data.basic, isSelf: true }] },
    { prefix: "residence", defs: RESIDENCE_DEFS, recs: () => [{ rec: data.residence, isSelf: true }] },
    { prefix: "household", defs: HOUSEHOLD_DEFS, recs: () => [{ rec: data.household, isSelf: true }] },
    { prefix: "member", defs: MEMBERS_DEF.items, recs: () => data.members.map((m) => ({ rec: m, isSelf: false })) },
    { prefix: "housing", defs: HOUSING_DEFS, recs: () => ps.map((p) => ({ rec: p.rec, isSelf: p.isSelf })) },
    { prefix: "income", defs: INCOME_DEFS, recs: () => ps.map((p) => ({ rec: p.rec, isSelf: p.isSelf })) },
    { prefix: "history", defs: HISTORY_DEFS, recs: () => ps.map((p) => ({ rec: p.rec, isSelf: p.isSelf })) },
    { prefix: "assets", defs: ASSET_DEFS, recs: () => [{ rec: data.assets, isSelf: true }] },
    { prefix: "account", defs: ACCOUNT_DEFS, recs: () => [{ rec: data.account, isSelf: true }] },
    { prefix: "extra", defs: EXTRA_DEFS, recs: () => [{ rec: data.extra, isSelf: true }] },
  ];
}

/** 보고에 쓰이는 모든 항목 키(서버 허용 목록과 같아야 함) */
export function reportFieldKeys(): string[] {
  const empty = { basic: {}, residence: {}, household: {}, members: [], persons: {}, assets: {}, account: {}, extra: {} } as unknown as PersonalData;
  const out: string[] = [];
  for (const g of groups(empty)) for (const d of g.defs) if (d.type === "list" || !d.noUnknown) out.push(`${g.prefix}.${d.key}`);
  return out.sort();
}

export function buildReport(data: PersonalData, now: Date = new Date()): Report {
  const fields: Record<string, FieldStatus> = {};
  for (const g of groups(data)) {
    for (const d of g.defs) {
      if (d.type !== "list" && d.noUnknown) continue; // 희망 조건은 통계에서 제외
      const key = `${g.prefix}.${d.key}`;
      for (const { rec, isSelf } of g.recs()) {
        if (d.selfOnly && !isSelf) continue;
        if (d.showIf && !d.showIf(rec)) continue;
        fields[key] = worse(fields[key], statusOf(d, rec));
      }
    }
  }
  return { v: 1, week: isoWeek(now), completed: data.completedAt !== null, fields, slots: data.slotReports.map((s) => s.category) };
}

function configured(): boolean {
  return !!REPORT_URL && !REPORT_URL.includes("YOUR-");
}

/** 이번 주에 아직 보내지 않았다면 한 번 보냅니다. 실패해도 조용히 넘어가고 다음 실행 때 다시 시도합니다. */
export async function maybeSendWeeklyReport(data: PersonalData, enabled: boolean, now: Date = new Date()): Promise<"sent" | "skipped" | "failed"> {
  if (!enabled || !configured() || data.updatedAt === "") return "skipped";
  const week = isoWeek(now);
  try {
    if (localStorage.getItem(LAST_SENT_KEY) === week) return "skipped";
  } catch {
    // 저장소를 못 읽으면 보내지 않음(중복 방지)
    return "skipped";
  }
  try {
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), 10000);
    const res = await fetch(REPORT_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buildReport(data, now)), signal: ctl.signal });
    window.clearTimeout(timer);
    if (!res.ok) return "failed";
    try { localStorage.setItem(LAST_SENT_KEY, week); } catch { /* 무시 */ }
    return "sent";
  } catch {
    return "failed";
  }
}
