// 공고 판정 진입점: 분양은 engine.ts, 임대는 rental.ts로 나눕니다.
import type { Notice } from "../notices";
import type { PersonalData } from "../profile/types";
import { evaluateSale, RULES, type NoticeResult, type Rules, type Verdict } from "./engine";
import { evaluateRental } from "./rental";

export { RULES } from "./engine";
export type { NoticeResult, TypeResult, Verdict, Check } from "./engine";

export function isRental(n: Notice): boolean {
  return n.kind === "임대" || /임대/.test(n.type);
}

export function evaluateNotice(data: PersonalData, notice: Notice, rules: Rules = RULES, today: Date = new Date()): NoticeResult {
  return isRental(notice) ? evaluateRental(data, notice, rules, today) : evaluateSale(data, notice, rules, today);
}

export function allTypes(r: NoticeResult) {
  return [...(r.general ? [r.general] : []), ...r.specials, ...r.rentals];
}

/** 목록 정렬·요약용 */
export function summarize(r: NoticeResult): { best: Verdict | null; possible: string[]; maybe: string[] } {
  if (!r.modeled) return { best: null, possible: [], maybe: [] };
  const all = allTypes(r);
  const possible = all.filter((t) => t.verdict === "가능").map((t) => t.name);
  const maybe = all.filter((t) => t.verdict === "확인 필요").map((t) => t.name);
  return { best: possible.length ? "가능" : maybe.length ? "확인 필요" : "불가", possible, maybe };
}
