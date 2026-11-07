// 자격 판정 엔진 v1 (공공분양 일반공급 + 특별공급).
// 입력: 내 정보(PersonalData) + 공고(Notice) + 규칙(rules.json). 결과는 "참고용"입니다.
// 기준일은 공고의 게시일(입주자모집공고일에 가까운 값)이며, 공고별 물량·지역 세부는 피드에 없어 '확인 필요'로 남깁니다.
// 모름·비어 있는 칸이 판정에 쓰이면 '불가'가 아니라 '확인 필요'로 둡니다.
import type { Notice } from "../notices";
import { UNKNOWN, type PersonalData, type Rec } from "../profile/types";
import rulesJson from "./rules.json";

export type Rules = typeof rulesJson;
export const RULES: Rules = rulesJson;

export type CheckStatus = "ok" | "fail" | "unknown" | "info";
export type Check = { label: string; status: CheckStatus; detail: string };
export type Verdict = "가능" | "불가" | "확인 필요";
export type TypeResult = { id: string; name: string; verdict: Verdict; checks: Check[] };
export type NoticeResult = {
  modeled: boolean;
  reason: string; // modeled=false일 때 이유
  refDate: string; // 기준일 YYYY-MM-DD
  refAssumed: boolean; // 공고 게시일이 없어 오늘로 대신한 경우
  category: "분양" | "임대";
  general: TypeResult | null;
  specials: TypeResult[]; // 분양: 특별공급 유형들
  rentals: TypeResult[]; // 임대: 유형·계층들
};

type Tri = boolean | null; // null = 모름·비어 있음

// ───────── 날짜·값 도구 ─────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(s: unknown): Date | null {
  if (typeof s !== "string" || !DATE_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addYears(d: Date, y: number): Date {
  const r = new Date(d.getTime());
  r.setUTCFullYear(r.getUTCFullYear() + y);
  return r;
}
/** 완전히 채운 개월 수 */
export function monthsBetween(from: Date, to: Date): number {
  let m = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) m -= 1;
  return m;
}
export function ageAt(birth: Date, ref: Date): number {
  return Math.floor(monthsBetween(birth, ref) / 12);
}
export function known(v: unknown): boolean {
  return !(v === undefined || v === null || v === "" || v === UNKNOWN);
}
export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
export function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}
export const ok = (label: string, detail: string): Check => ({ label, status: "ok", detail });
export const fail = (label: string, detail: string): Check => ({ label, status: "fail", detail });
export const unk = (label: string, detail: string): Check => ({ label, status: "unknown", detail });
export const info = (label: string, detail: string): Check => ({ label, status: "info", detail });

export function verdictOf(checks: Check[]): Verdict {
  if (checks.some((c) => c.status === "fail")) return "불가";
  if (checks.some((c) => c.status === "unknown")) return "확인 필요";
  return "가능";
}

// ───────── 세대 구성 ─────────
type Member = { id: string; rec: Rec; person: Rec };

export function sidoOf(text: string): string | null {
  const t = text.trim();
  const table: [string, string][] = [
    ["서울", "서울특별시"], ["부산", "부산광역시"], ["대구", "대구광역시"], ["인천", "인천광역시"],
    ["광주", "광주광역시"], ["대전", "대전광역시"], ["울산", "울산광역시"], ["세종", "세종특별자치시"],
    ["경기", "경기도"], ["강원", "강원특별자치도"], ["충북", "충청북도"], ["충청북", "충청북도"],
    ["충남", "충청남도"], ["충청남", "충청남도"], ["전북", "전북특별자치도"], ["전라북", "전북특별자치도"],
    ["전남", "전라남도"], ["전라남", "전라남도"], ["경북", "경상북도"], ["경상북", "경상북도"],
    ["경남", "경상남도"], ["경상남", "경상남도"], ["제주", "제주특별자치도"],
  ];
  for (const [p, full] of table) if (t.startsWith(p)) return full;
  return null;
}

export type Household = {
  self: Rec;
  members: Member[]; // 세대 범위에 드는 세대원(본인 제외)
  spouse: Member | null;
  size: number; // 소득 기준용 가구원 수(태아 포함)
  fetus: number | null;
};

export function buildHousehold(data: PersonalData): Household {
  const members: Member[] = [];
  data.members.forEach((m, i) => {
    const id = String(m.id ?? i);
    if (m.relation === "형제자매") return; // 세대원 범위에서 제외
    if (m.relation === "자녀" && m.marriedChild === true) return; // 혼인한 자녀 제외
    members.push({ id, rec: m, person: data.persons[id] ?? {} });
  });
  const spouse = members.find((m) => m.rec.relation === "배우자") ?? null;
  const fetus = num(data.household.fetusCount);
  return { self: data.persons["self"] ?? {}, members, spouse, size: 1 + members.length + (fetus ?? 0), fetus };
}

export function allPersons(h: Household): Rec[] {
  return [h.self, ...h.members.map((m) => m.person)];
}

// ───────── 공통 확인 항목 ─────────
export function checkNoHome(h: Household, rules: Rules): Check {
  const label = "무주택세대구성원";
  let anyUnknown = false;
  const exemptHints: string[] = [];
  for (const p of allPersons(h)) {
    if (p.owns === true) {
      const houses = Array.isArray(p.houses) ? (p.houses as Rec[]) : [];
      const exempt =
        houses.length > 0 &&
        houses.every((x) => x.via === "상속" || x.via === "공유지분" || (num(x.area) !== null && (num(x.area) as number) <= rules.smallHouse.maxArea));
      if (exempt) {
        anyUnknown = true;
        exemptHints.push("상속·공유지분·소형 주택 예외가 적용될 수 있습니다");
        continue;
      }
      return fail(label, "세대에 주택 소유자가 있습니다.");
    }
    if (p.hasRight === true) {
      anyUnknown = true;
      exemptHints.push("분양권·입주권은 취득 시점에 따라 주택으로 봅니다");
    }
    if (!known(p.owns) || p.owns === UNKNOWN) anyUnknown = true;
  }
  if (anyUnknown) {
    return unk(label, exemptHints.length ? `${[...new Set(exemptHints)].join(". ")}. 공고문으로 확인하세요.` : "주택 소유 여부 중 모름·빈 칸이 있습니다.");
  }
  return ok(label, "세대 전원이 주택을 소유하지 않았습니다.");
}

function accountOk(
  data: PersonalData,
  ref: Date,
  need: { months: number; count: number },
  lenient: { months: number; count: number } | null,
  label: string,
  extraNote = "",
): Check {
  const a = data.account;
  if (a.type === "없음") return fail(label, "청약통장이 없습니다.");
  if (!known(a.type)) return unk(label, "통장 종류가 모름·빈 칸입니다.");
  if (a.type === "청약예금" || a.type === "청약부금") return unk(label, "청약예금·부금은 국민주택 청약 가능 여부를 확인해야 합니다(주택청약종합저축 전환 등).");
  const join = parseDate(a.joinDate);
  const cnt = num(a.payCount);
  if (!join || cnt === null) return unk(label, "가입일 또는 납입 회차가 모름·빈 칸입니다.");
  const months = monthsBetween(join, ref);
  const mine = `가입 ${months}개월, 납입 ${cnt}회`;
  const meets = (n: { months: number; count: number }) => months >= n.months && cnt >= n.count;
  if (meets(need)) return ok(label, `${mine} (필요 ${need.months}개월/${need.count}회)${extraNote}`);
  if (lenient && meets(lenient)) {
    return unk(label, `${mine}. 공고 지역이 투기과열·청약과열 지역이면 ${need.months}개월/${need.count}회가 필요하고, 아니면 ${lenient.months}개월/${lenient.count}회로 충족합니다.`);
  }
  const lowest = lenient ?? need;
  return fail(label, `${mine} (필요 ${lowest.months}개월/${lowest.count}회 이상)`);
}

function checkAssets(data: PersonalData, rules: Rules, applyNote: string): Check {
  const label = "자산(부동산·자동차)";
  const re = num(data.assets.realEstate);
  const ve = num(data.assets.vehicle);
  const limRe = rules.assets.realEstate;
  const limVe = rules.assets.vehicle;
  const parts: string[] = [];
  let over = false;
  let missing = false;
  if (re === null) missing = true; else if (re > limRe) { over = true; parts.push(`부동산 ${won(re)} > ${won(limRe)}`); }
  if (ve === null) missing = true; else if (ve > limVe) { over = true; parts.push(`자동차 ${won(ve)} > ${won(limVe)}`); }
  if (over) return unk(label, `${parts.join(", ")}. ${applyNote}`);
  if (missing) return unk(label, "부동산 또는 자동차 금액이 모름·빈 칸입니다.");
  return ok(label, `부동산 ${won(re as number)} ≤ ${won(limRe)}, 자동차 ${won(ve as number)} ≤ ${won(limVe)}`);
}

function checkLimits(h: Household, ref: Date, specialToo: boolean): Check[] {
  const out: Check[] = [];
  const persons = allPersons(h);
  // 부적격 당첨 제한(1년)
  let dq: Tri = false;
  let dqDetail = "";
  for (const p of persons) {
    if (p.disqualified === true) {
      const d = parseDate(p.disqualifiedDate);
      if (!d) { if (dq !== true) dq = null; continue; }
      if (addYears(d, 1) > ref) { dq = true; dqDetail = `부적격 당첨 통보일 ${iso(d)}부터 1년 이내`; }
    } else if (p.disqualified === undefined || p.disqualified === null || p.disqualified === UNKNOWN) {
      if (dq !== true) dq = null;
    }
  }
  if (dq === true) out.push(fail("부적격 당첨 제한", dqDetail));
  else if (dq === null) out.push(unk("부적격 당첨 제한", "부적격 당첨 이력이 모름·빈 칸입니다."));
  else out.push(ok("부적격 당첨 제한", "제한 대상이 아닙니다."));

  if (specialToo) {
    let sp: Tri = false;
    for (const p of persons) {
      if (p.specialWon === true) { sp = true; break; }
      if (p.specialWon === undefined || p.specialWon === null || p.specialWon === UNKNOWN) sp = null;
    }
    if (sp === true) out.push(fail("특별공급 당첨 이력", "특별공급은 원칙적으로 평생 1회만 신청할 수 있습니다."));
    else if (sp === null) out.push(unk("특별공급 당첨 이력", "특별공급 당첨 이력이 모름·빈 칸입니다."));
    else out.push(ok("특별공급 당첨 이력", "특별공급 당첨 이력이 없습니다."));
  }

  // 재당첨 제한: 공공분양 당첨 이력이 있으면 기간 확인 안내
  const publicWins: string[] = [];
  let winsUnknown = false;
  for (const p of persons) {
    if (Array.isArray(p.wins)) {
      for (const w of p.wins as Rec[]) {
        if (w.houseKind === "공공분양" || w.houseKind === UNKNOWN || !known(w.houseKind)) publicWins.push(typeof w.date === "string" ? w.date : "일자 미상");
      }
    } else if (p.wins === UNKNOWN || p.wins === undefined || p.wins === null) winsUnknown = true;
  }
  if (publicWins.length) out.push(unk("재당첨 제한", `과거 분양주택 당첨 이력(${publicWins.join(", ")})이 있어 재당첨 제한 기간을 공고문으로 확인해야 합니다.`));
  else if (winsUnknown) out.push(unk("재당첨 제한", "과거 당첨 이력이 모름·빈 칸입니다."));
  else out.push(ok("재당첨 제한", "분양주택 당첨 이력이 없습니다."));
  return out;
}

// ───────── 소득 ─────────
function incomeBase(rules: Rules, size: number): number {
  const t = rules.incomeBase.bySize as Record<string, number>;
  if (size <= 3) return t["3"];
  if (size >= 8) return t["8"];
  return t[String(size)];
}

function birthRelief(h: Household, rules: Rules, ref: Date): { pct: number; count: number } {
  const since = parseDate(rules.birthRelief.since);
  let count = 0;
  for (const m of h.members) {
    if (m.rec.relation !== "자녀") continue;
    const b = parseDate(m.rec.birth);
    if (b && since && b >= since && b <= ref) count += 1;
  }
  count += h.fetus ?? 0;
  const pct = count >= 2 ? rules.birthRelief.twoPlusPct : count === 1 ? rules.birthRelief.oneChildPct : 0;
  return { pct, count };
}

type IncomeLimit = { single: number; dual: number; generalSingle?: number; generalDual?: number };

export function personIncome(p: Rec): number | null | "none" {
  if (p.incomeType === "없음") return "none";
  if (!known(p.incomeType)) return null;
  return num(p.monthlyIncome);
}

function checkIncome(h: Household, rules: Rules, ref: Date, lim: IncomeLimit): Check {
  const label = "소득 기준";
  const base = incomeBase(rules, h.size);
  const relief = birthRelief(h, rules, ref);
  const bonus = relief.pct;

  let sum = 0;
  let missing = false;
  for (const p of allPersons(h)) {
    const v = personIncome(p);
    if (v === "none") continue;
    if (v === null) { missing = true; continue; }
    sum += v;
  }
  // 맞벌이: 본인과 배우자가 모두 소득이 있음
  const sv = personIncome(h.self);
  const pv = h.spouse ? personIncome(h.spouse.person) : "none";
  const has = (v: number | null | "none") => (v === "none" ? false : v === null ? null : v > 0);
  const a = has(sv);
  const b = has(pv);
  const dual: Tri = a === false || b === false ? false : a === null || b === null ? null : true;

  const pct = (n: number) => n + bonus;
  const priSingle = base * (pct(lim.single) / 100);
  const priDual = base * (pct(lim.dual) / 100);
  const genSingle = lim.generalSingle !== undefined ? base * (pct(lim.generalSingle) / 100) : null;
  const genDual = lim.generalDual !== undefined ? base * (pct(lim.generalDual) / 100) : null;
  const tag = `가구원 ${h.size}명, 월 소득 합계 ${won(sum)}${missing ? "(입력된 분만)" : ""}${bonus ? `, 출산가구 완화 +${bonus}%p` : ""}`;

  const maxLimit = dual === true ? (genDual ?? priDual) : dual === false ? (genSingle ?? priSingle) : (genDual ?? priDual);
  const minLimit = dual === true ? priDual : priSingle;

  if (sum > maxLimit) return fail(label, `${tag}. 기준(최대 ${won(Math.round(maxLimit))})을 넘습니다.`);
  if (missing) return unk(label, `${tag}. 소득이 모름·빈 칸인 세대원이 있습니다.`);
  if (dual === null) {
    const lo = priSingle;
    if (sum <= lo) return ok(label, `${tag}. 맞벌이 여부와 상관없이 기준(${won(Math.round(lo))}) 이내입니다.`);
    return unk(label, `${tag}. 맞벌이 여부에 따라 기준이 달라집니다(홑벌이 ${won(Math.round(priSingle))}, 맞벌이 ${won(Math.round(priDual))}).`);
  }
  if (sum <= minLimit) return ok(label, `${tag}. ${dual ? "맞벌이" : "홑벌이"} 기준 ${won(Math.round(minLimit))} 이내입니다.`);
  return ok(label, `${tag}. 우선공급 기준(${won(Math.round(minLimit))})은 넘지만 잔여 일반 기준(${won(Math.round(maxLimit))}) 이내라 우선공급보다 경쟁이 불리합니다.`);
}

// ───────── 유형별 판정 ─────────
type Ctx = { data: PersonalData; h: Household; rules: Rules; ref: Date; notice: Notice };

function childrenOf(c: Ctx): { list: { birth: Date | null }[] } {
  const list: { birth: Date | null }[] = [];
  for (const m of c.h.members) {
    if (m.rec.relation !== "자녀") continue;
    const b = parseDate(m.rec.birth);
    list.push({ birth: b });
  }
  return { list };
}

function minorChildCount(c: Ctx): { count: number; unknown: boolean } {
  let count = 0;
  let unknown = false;
  for (const ch of childrenOf(c).list) {
    if (!ch.birth) { unknown = true; continue; }
    if (ageAt(ch.birth, c.ref) < 19) count += 1;
  }
  if (c.h.fetus === null) unknown = true;
  count += c.h.fetus ?? 0;
  return { count, unknown };
}

function generalType(c: Ctx): TypeResult {
  const { data, h, rules, ref, notice } = c;
  const checks: Check[] = [];
  checks.push(checkNoHome(h, rules));
  const sido = sidoOf(notice.region || "");
  const g = rules.account.general;
  const metro = sido !== null && (rules.account.metropolitan as string[]).includes(sido);
  if (sido !== null && !metro) {
    checks.push(accountOk(data, ref, g.outside, null, "청약통장 1순위", ` — ${sido} 공고`));
  } else {
    checks.push(accountOk(data, ref, g.strict, sido === null ? g.outside : g.lenient, "청약통장 1순위"));
  }
  checks.push(checkAssets(data, rules, "전용 60㎡ 이하 공급이면 자산 기준이 적용됩니다. 공고문의 주택형을 확인하세요."));
  checks.push(...checkLimits(h, ref, false));
  const mySido = typeof data.residence.sido === "string" ? data.residence.sido : null;
  if (sido && mySido) {
    checks.push(info("거주지", mySido === sido ? `${sido} 거주자로 해당지역 우선공급 대상일 수 있습니다.` : `공고 지역(${sido})이 아닌 ${mySido} 거주자라 기타지역 순서로 경쟁합니다.`));
  } else {
    checks.push(info("거주지", "공고의 해당지역·거주기간 요건은 공고문에서 확인하세요."));
  }
  return { id: "일반공급", name: "일반공급", verdict: verdictOf(checks), checks };
}

function specialBase(c: Ctx, typeId: keyof Rules["types"], needAccount: boolean): Check[] {
  const { data, h, rules, ref } = c;
  const checks: Check[] = [checkNoHome(h, rules)];
  if (needAccount) {
    const t = rules.types[typeId] as { account?: { months: number; count: number } };
    if (t.account) checks.push(accountOk(data, ref, t.account, null, "청약통장"));
  }
  return checks;
}

function incomeLimitOf(rules: Rules, id: "신혼부부" | "신생아" | "생애최초" | "다자녀" | "노부모부양"): IncomeLimit {
  return rules.types[id].income as IncomeLimit;
}

function newlywed(c: Ctx): TypeResult {
  const { data, h, rules, ref } = c;
  const t = rules.types.신혼부부;
  const checks: Check[] = [];
  const b = data.basic;
  // 신혼 자격
  let elig: Check;
  const marital = b.marital;
  if (marital === "기혼") {
    const md = parseDate(b.marriageDate);
    if (!md) elig = unk("신혼 자격", "혼인신고일이 모름·빈 칸입니다.");
    else if (addYears(md, t.marriageYears) >= ref) elig = ok("신혼 자격", `혼인신고일 ${iso(md)} — 공고일 기준 혼인 ${t.marriageYears}년 이내`);
    else if (b.singleParent === true) elig = unk("신혼 자격", "혼인 7년을 넘었습니다. 한부모 유형(6세 이하 자녀)은 아래 자녀 확인이 필요합니다.");
    else elig = fail("신혼 자격", `혼인신고일 ${iso(md)} — 공고일 기준 혼인 ${t.marriageYears}년을 넘었습니다.`);
  } else if (marital === "예비신혼") {
    const wd = parseDate(b.weddingPlanned);
    if (!wd) elig = unk("신혼 자격", "혼인 예정일이 모름·빈 칸입니다.");
    else if (wd > ref) elig = ok("신혼 자격", `예비신혼부부(혼인 예정 ${iso(wd)}) — 입주 전까지 혼인 증명이 필요합니다.`);
    else elig = unk("신혼 자격", "혼인 예정일이 공고일 이전입니다. 혼인신고 여부를 확인하세요.");
  } else if (b.singleParent === true) {
    elig = unk("신혼 자격", "한부모 유형: 만 6세 이하 자녀가 있어야 합니다(아래 확인).");
  } else if (!known(marital)) {
    elig = unk("신혼 자격", "혼인 상태가 모름·빈 칸입니다.");
  } else {
    elig = fail("신혼 자격", `혼인 상태가 '${String(marital)}'이라 신혼부부·예비신혼 유형이 아닙니다.`);
  }
  checks.push(elig);
  if (b.singleParent === true && marital !== "기혼" && marital !== "예비신혼") {
    const young = c.h.members.filter((m) => {
      if (m.rec.relation !== "자녀") return false;
      const bd = parseDate(m.rec.birth);
      return bd !== null && ageAt(bd, ref) <= t.singleParentChildMaxAge;
    });
    checks.push(young.length ? ok("한부모 자녀", `만 ${t.singleParentChildMaxAge}세 이하 자녀 ${young.length}명`) : fail("한부모 자녀", `만 ${t.singleParentChildMaxAge}세 이하 자녀가 없습니다.`));
  }
  checks.push(...specialBase(c, "신혼부부", true));
  checks.push(checkIncome(h, rules, ref, incomeLimitOf(rules, "신혼부부")));
  checks.push(checkAssets(data, rules, "특별공급은 자산 기준이 적용됩니다."));
  checks.push(...checkLimits(h, ref, true));
  return { id: "신혼부부", name: t.title, verdict: verdictOf(checks), checks };
}

function newborn(c: Ctx): TypeResult {
  const { data, h, rules, ref } = c;
  const t = rules.types.신생아;
  const checks: Check[] = [];
  const kids = childrenOf(c).list;
  const young = kids.filter((k) => k.birth && addYears(k.birth, t.childMaxAgeYears) > ref && k.birth <= ref);
  const anyUnknown = kids.some((k) => !k.birth);
  if (young.length) checks.push(ok("2세 미만 자녀", `공고일 기준 만 ${t.childMaxAgeYears}세 미만 자녀 ${young.length}명`));
  else if (anyUnknown) checks.push(unk("2세 미만 자녀", "자녀 생년월일이 모름·빈 칸입니다."));
  else if ((h.fetus ?? 0) > 0) checks.push(unk("2세 미만 자녀", "임신 중인 태아는 공고별로 인정 여부가 다릅니다. 공고문을 확인하세요."));
  else checks.push(fail("2세 미만 자녀", "공고일 기준 2세 미만 자녀가 없습니다."));
  checks.push(...specialBase(c, "신생아", true));
  checks.push(checkIncome(h, rules, ref, incomeLimitOf(rules, "신생아")));
  checks.push(checkAssets(data, rules, "특별공급은 자산 기준이 적용됩니다."));
  checks.push(...checkLimits(h, ref, true));
  return { id: "신생아", name: t.title, verdict: verdictOf(checks), checks };
}

function firstTime(c: Ctx): TypeResult {
  const { data, h, rules, ref } = c;
  const t = rules.types.생애최초;
  const checks: Check[] = [];
  // 세대원 전원 과거 포함 소유 이력 없음
  let anyOwned = false;
  let anyUnknown = false;
  for (const p of allPersons(h)) {
    if (p.owns === true || p.hadBefore === true) anyOwned = true;
    else if (p.owns === false && p.hadBefore === false) continue;
    else if (p.owns === false && !(p.hadBefore === undefined || p.hadBefore === null || p.hadBefore === UNKNOWN)) continue;
    else anyUnknown = true;
  }
  if (anyOwned) checks.push(fail("생애 최초 무주택", "본인 또는 세대원이 주택을 소유했거나 소유한 적이 있습니다."));
  else if (anyUnknown) checks.push(unk("생애 최초 무주택", "과거 주택 소유 이력이 모름·빈 칸인 세대원이 있습니다."));
  else checks.push(ok("생애 최초 무주택", "세대 전원이 주택을 소유한 적이 없습니다."));
  checks.push(...specialBase(c, "생애최초", true));
  const a = data.account;
  const pt = num(a.payTotal);
  if (a.type === "없음") { /* 통장 항목에서 이미 불충족 */ }
  else if (pt === null) checks.push(unk("납입 총액", "납입 인정 총액이 모름·빈 칸입니다."));
  else if (pt >= t.payTotalMin) checks.push(ok("납입 총액", `${won(pt)} ≥ ${won(t.payTotalMin)}`));
  else checks.push(fail("납입 총액", `${won(pt)} < ${won(t.payTotalMin)}`));
  const self = h.self;
  if (self.working === true) checks.push(ok("근로·사업 중", "현재 소득 활동 중입니다."));
  else if (self.working === false) checks.push(fail("근로·사업 중", "현재 근로·사업 중이어야 합니다."));
  else checks.push(unk("근로·사업 중", "모름·빈 칸입니다."));
  const ty = num(self.taxYears);
  if (ty === null) checks.push(unk("소득세 납부", `소득세 납부 연도 수가 모름·빈 칸입니다(${t.taxYears}년 이상 필요).`));
  else if (ty >= t.taxYears) checks.push(ok("소득세 납부", `${ty}년 ≥ ${t.taxYears}년`));
  else checks.push(fail("소득세 납부", `${ty}년 < ${t.taxYears}년`));
  checks.push(checkIncome(h, rules, ref, incomeLimitOf(rules, "생애최초")));
  checks.push(checkAssets(data, rules, "특별공급은 자산 기준이 적용됩니다."));
  checks.push(...checkLimits(h, ref, true));
  return { id: "생애최초", name: t.title, verdict: verdictOf(checks), checks };
}

function multiChild(c: Ctx): TypeResult {
  const { data, h, rules, ref } = c;
  const t = rules.types.다자녀;
  const checks: Check[] = [];
  const { count, unknown } = minorChildCount(c);
  if (count >= t.minChildren) checks.push(ok("미성년 자녀 수", `${count}명(태아 포함) ≥ ${t.minChildren}명`));
  else if (unknown) checks.push(unk("미성년 자녀 수", `확인된 자녀 ${count}명. 자녀 생년월일 또는 태아 수가 모름·빈 칸입니다.`));
  else checks.push(fail("미성년 자녀 수", `${count}명 < ${t.minChildren}명`));
  checks.push(...specialBase(c, "다자녀", true));
  checks.push(checkIncome(h, rules, ref, incomeLimitOf(rules, "다자녀")));
  checks.push(checkAssets(data, rules, "특별공급은 자산 기준이 적용됩니다."));
  checks.push(...checkLimits(h, ref, true));
  return { id: "다자녀", name: t.title, verdict: verdictOf(checks), checks };
}

function elderCare(c: Ctx): TypeResult {
  const { data, h, rules, ref } = c;
  const t = rules.types.노부모부양;
  const checks: Check[] = [];
  const b = data.basic;
  if (b.isHead === true) checks.push(ok("세대주", "세대주입니다."));
  else if (b.isHead === false) checks.push(fail("세대주", "노부모부양 특별공급은 세대주만 신청할 수 있습니다."));
  else checks.push(unk("세대주", "세대주 여부가 모름·빈 칸입니다."));

  const lineal = h.members.filter((m) => ["부·모", "배우자의 부·모", "조부모"].includes(String(m.rec.relation)));
  if (lineal.length === 0) {
    checks.push(fail("만 65세 이상 직계존속", "세대원에 직계존속이 없습니다."));
  } else {
    let best: Check | null = null;
    for (const m of lineal) {
      const bd = parseDate(m.rec.birth);
      if (!bd) { best = best ?? unk("만 65세 이상 직계존속", "직계존속 생년월일이 모름·빈 칸입니다."); continue; }
      if (ageAt(bd, ref) < t.parentMinAge) { best = best ?? fail("만 65세 이상 직계존속", `직계존속이 만 ${t.parentMinAge}세 미만입니다.`); continue; }
      if (m.rec.registered !== true) { best = best?.status === "ok" ? best : unk("만 65세 이상 직계존속", "같은 등본에 올라 있지 않으면 부양으로 인정되지 않을 수 있습니다."); continue; }
      const rd = parseDate(m.rec.registeredDate);
      if (!rd) { best = best?.status === "ok" ? best : unk("만 65세 이상 직계존속", "등본 등재일이 모름·빈 칸입니다."); continue; }
      if (addYears(rd, t.supportYears) <= ref) { best = ok("만 65세 이상 직계존속", `만 ${t.parentMinAge}세 이상 직계존속을 ${iso(rd)}부터 같은 등본에서 부양(${t.supportYears}년 이상)`); break; }
      best = best?.status === "ok" ? best : fail("만 65세 이상 직계존속", `등재일 ${iso(rd)} — 부양 기간 ${t.supportYears}년 미만`);
    }
    checks.push(best as Check);
  }
  checks.push(...specialBase(c, "노부모부양", true));
  checks.push(checkIncome(h, rules, ref, incomeLimitOf(rules, "노부모부양")));
  checks.push(checkAssets(data, rules, "특별공급은 자산 기준이 적용됩니다."));
  checks.push(...checkLimits(h, ref, true));
  return { id: "노부모부양", name: t.title, verdict: verdictOf(checks), checks };
}

function agency(c: Ctx): TypeResult {
  const t = c.rules.types.기관추천;
  const v = c.data.extra.agencyClasses;
  const checks: Check[] = [];
  if (v === UNKNOWN || v === undefined || v === null) {
    checks.push(unk("추천 대상 분류", "해당 분류가 모름·빈 칸입니다."));
  } else if (Array.isArray(v)) {
    const real = (v as string[]).filter((x) => x !== "해당 없음");
    if (real.length) checks.push(unk("추천 대상 분류", `${real.join(", ")}에 해당할 수 있습니다. 추천은 해당 기관이 하며, 앱은 신청 가능성만 안내합니다.`));
    else checks.push(fail("추천 대상 분류", "해당되는 분류가 없습니다."));
  }
  checks.push(info("신청 방법", "기관추천은 해당 기관의 추천을 받아야 하므로 일반 신청과 절차가 다릅니다. 공고문과 기관에 확인하세요."));
  return { id: "기관추천", name: t.title, verdict: verdictOf(checks), checks };
}

// ───────── 공고별 진입점 (분양) ─────────
export function saleModelStatus(n: Notice): { modeled: boolean; reason: string } {
  const text = `${n.type} ${n.title}`;
  if (/토지|상가|주차장|매각|부대복리/.test(text)) return { modeled: false, reason: "주택 공급 공고가 아니라 판정하지 않습니다." };
  if (/신혼희망타운/.test(text)) return { modeled: false, reason: "신혼희망타운은 별도 기준이라 아직 판정하지 않습니다. 공고문을 확인하세요." };
  if (/민간|민영/.test(text)) return { modeled: false, reason: "민영주택은 가점제 등 별도 기준이라 아직 판정하지 않습니다." };
  return { modeled: true, reason: "" };
}

export function refDateOf(notice: Notice, today: Date): { ref: Date; assumed: boolean } {
  const posted = parseDate(notice.posted);
  return { ref: posted ?? new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())), assumed: posted === null };
}

export function evaluateSale(data: PersonalData, notice: Notice, rules: Rules = RULES, today: Date = new Date()): NoticeResult {
  const { ref, assumed } = refDateOf(notice, today);
  const m = saleModelStatus(notice);
  const base: NoticeResult = { modeled: m.modeled, reason: m.reason, refDate: iso(ref), refAssumed: assumed, category: "분양", general: null, specials: [], rentals: [] };
  if (!m.modeled) return base;

  const c: Ctx = { data, h: buildHousehold(data), rules, ref, notice };
  const ov = (rules.noticeOverrides as Record<string, { disableTypes?: string[] }>)[notice.id];
  const disabled = new Set(ov?.disableTypes ?? []);
  const all: TypeResult[] = [newlywed(c), newborn(c), firstTime(c), multiChild(c), elderCare(c), agency(c)];
  return {
    ...base,
    general: disabled.has("일반공급") ? null : generalType(c),
    specials: all.filter((t) => !disabled.has(t.id)),
  };
}
