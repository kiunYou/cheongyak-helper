// 임대주택 판정(영구·국민·행복·통합공공·공공임대·매입/전세임대). 분양 판정과 같은 규칙: 모름·빈 칸은 '확인 필요'.
// 소득 기준 표와 자산 한도는 rules.json의 rental 항목을 씁니다. 공고별 세부(주택형·계층별 물량)는 반영하지 않습니다.
import type { Notice } from "../notices";
import { UNKNOWN, type PersonalData } from "../profile/types";
import {
  RULES, ageAt, addYears, parseDate, iso, known, num, won, ok, fail, unk, info, verdictOf,
  buildHousehold, allPersons, checkNoHome, personIncome, refDateOf,
  type Check, type Household, type NoticeResult, type Rules, type TypeResult,
} from "./engine";

type RentalId = "영구임대" | "국민임대" | "행복주택" | "통합공공임대" | "공공임대" | "매입전세임대";

export function rentalKind(n: Notice): { id: RentalId | null; reason: string } {
  const t = `${n.type} ${n.title}`;
  if (/영구임대/.test(t)) return { id: "영구임대", reason: "" };
  if (/장기전세|시프트/.test(t)) return { id: null, reason: "장기전세는 서울시 별도 기준이라 아직 판정하지 않습니다. 공고문을 확인하세요." };
  if (/통합공공임대/.test(t)) return { id: "통합공공임대", reason: "" };
  if (/행복주택|청년안심/.test(t)) return { id: "행복주택", reason: "" };
  if (/국민임대/.test(t)) return { id: "국민임대", reason: "" };
  if (/매입임대|전세임대|다가구/.test(t)) return { id: "매입전세임대", reason: "" };
  if (/공공임대|분양전환|5년|10년/.test(t)) return { id: "공공임대", reason: "" };
  return { id: null, reason: "임대 유형을 알 수 없어 판정하지 않습니다. 공고문을 확인하세요." };
}

// ───────── 소득·자산 도구 ─────────
function urbanBase(r: Rules, size: number): number {
  const t = r.rental.urbanIncome.bySize as Record<string, number>;
  const n = Math.max(1, size);
  if (n <= 8) return t[String(n)];
  return t["8"] + (n - 8) * r.rental.urbanIncome.extraPerPerson;
}

function incomeTotal(h: Household): { sum: number; missing: boolean } {
  let sum = 0;
  let missing = false;
  for (const p of allPersons(h)) {
    const v = personIncome(p);
    if (v === "none") continue;
    if (v === null) { missing = true; continue; }
    sum += v;
  }
  return { sum, missing };
}

function incomeVs(h: Household, limit: number, text: string, label = "소득 기준", size = h.size): Check {
  const { sum, missing } = incomeTotal(h);
  const tag = `가구원 ${size}명, 월 소득 합계 ${won(sum)}${missing ? "(입력된 분만)" : ""}, 기준 ${text} = ${won(Math.round(limit))}`;
  if (sum > limit) return fail(label, `${tag}. 기준을 넘습니다.`);
  if (missing) return unk(label, `${tag}. 소득이 모름·빈 칸인 세대원이 있습니다.`);
  return ok(label, `${tag}. 기준 이내입니다.`);
}

type AssetLimit = { total: number; car: number; label: string };

function assetsVs(data: PersonalData, lim: AssetLimit): Check {
  const label = "자산(총자산·자동차)";
  const a = data.assets;
  const re = num(a.realEstate);
  const fin = num(a.financial);
  const car = num(a.vehicle);
  const debt = num(a.debt) ?? 0;
  const total = (re ?? 0) + (fin ?? 0) + (car ?? 0) - debt;
  const parts = `부동산+금융+자동차−부채 = ${won(Math.max(total, 0))} (한도 ${won(lim.total)}), 자동차 ${car === null ? "?" : won(car)} (한도 ${lim.car === 0 ? "소유 불가" : won(lim.car)})`;
  if (total > lim.total || (car !== null && car > lim.car)) return fail(label, `${parts}. 한도를 넘습니다. (${lim.label})`);
  if (re === null || fin === null || car === null) return unk(label, `${parts}. 부동산·금융자산·자동차 중 모름·빈 칸이 있습니다. (${lim.label})`);
  return ok(label, `${parts}. 한도 이내입니다. 임차보증금 등 입력하지 않은 자산이 있으면 합산될 수 있습니다.`);
}

const BASIC_NOTE = "같은 등본에 형제자매가 있으면 공고에 따라 세대구성원에 포함될 수 있어 소득·무주택 판정이 달라질 수 있습니다.";

function common(h: Household, rules: Rules): Check[] {
  return [checkNoHome(h, rules)];
}

function siblingNote(data: PersonalData): Check[] {
  return data.members.some((m) => m.relation === "형제자매") ? [info("세대 범위", BASIC_NOTE)] : [];
}

function accountInfo(data: PersonalData, ref: Date): Check {
  const a = data.account;
  if (a.type === "없음") return info("청약통장", "통장이 없습니다. 입주자저축 가입 증명이 필요한 계층이면 입주 전까지 가입해야 하고, 순위·가점은 통장 기준입니다.");
  const join = parseDate(a.joinDate);
  const cnt = num(a.payCount);
  if (!join || cnt === null) return info("청약통장", "가입 기간·납입 횟수가 입력되지 않아 순위를 안내하지 못합니다.");
  const months = (ref.getUTCFullYear() - join.getUTCFullYear()) * 12 + (ref.getUTCMonth() - join.getUTCMonth());
  const rank = months >= 24 && cnt >= 24 ? "1순위(가입 2년·24회 이상)" : months >= 6 && cnt >= 6 ? "2순위(6개월·6회 이상)" : "3순위";
  return info("청약통장", `가입 ${months}개월, 납입 ${cnt}회 → 임대 ${rank}`);
}

// ───────── 개인 속성 ─────────
function selfAge(data: PersonalData, ref: Date): number | null {
  const b = parseDate(data.basic.birth);
  return b ? ageAt(b, ref) : null;
}

function kidsUnder(data: PersonalData, h: Household, ref: Date, maxAge: number): { count: number; unknown: boolean } {
  let count = 0;
  let unknown = false;
  for (const m of h.members) {
    if (m.rec.relation !== "자녀") continue;
    const b = parseDate(m.rec.birth);
    if (!b) { unknown = true; continue; }
    if (ageAt(b, ref) <= maxAge) count += 1;
  }
  const f = num(data.household.fetusCount);
  if (f === null) unknown = true;
  count += f ?? 0;
  return { count, unknown };
}

function notMarried(data: PersonalData): Check {
  const m = data.basic.marital;
  if (m === "기혼" || m === "예비신혼") return fail("혼인 중이 아님", `혼인 상태가 '${String(m)}'입니다. 신혼부부 계층을 확인하세요.`);
  if (!known(m)) return unk("혼인 중이 아님", "혼인 상태가 모름·빈 칸입니다.");
  return ok("혼인 중이 아님", `혼인 상태 '${String(m)}'`);
}

function newlywedElig(data: PersonalData, h: Household, ref: Date, rules: Rules): Check {
  const hp = rules.rental.happy;
  const b = data.basic;
  const kids = kidsUnder(data, h, ref, hp.childMaxAge);
  if (b.marital === "기혼") {
    const md = parseDate(b.marriageDate);
    if (md && addYears(md, hp.marriageYears) >= ref) return ok("신혼부부 자격", `혼인신고일 ${iso(md)} — 혼인 ${hp.marriageYears}년 이내`);
    if (kids.count > 0) return ok("신혼부부 자격", `만 ${hp.childMaxAge}세 이하 자녀(태아 포함) ${kids.count}명`);
    if (!md) return unk("신혼부부 자격", "혼인신고일이 모름·빈 칸입니다.");
    if (kids.unknown) return unk("신혼부부 자격", "혼인 7년을 넘었습니다. 자녀 생년월일이 모름·빈 칸이라 6세 이하 자녀 여부를 알 수 없습니다.");
    return fail("신혼부부 자격", `혼인 ${hp.marriageYears}년을 넘었고 만 ${hp.childMaxAge}세 이하 자녀도 없습니다.`);
  }
  if (b.marital === "예비신혼") {
    const wd = parseDate(b.weddingPlanned);
    if (!wd) return unk("신혼부부 자격", "혼인 예정일이 모름·빈 칸입니다.");
    return wd > ref ? ok("신혼부부 자격", `예비신혼부부(혼인 예정 ${iso(wd)}) — 입주 전 혼인 증명 필요`) : unk("신혼부부 자격", "혼인 예정일이 공고일 이전입니다. 혼인신고 여부를 확인하세요.");
  }
  if (!known(b.marital)) return unk("신혼부부 자격", "혼인 상태가 모름·빈 칸입니다.");
  return fail("신혼부부 자격", `혼인 상태가 '${String(b.marital)}'이라 신혼부부 계층이 아닙니다.`);
}

function dualIncome(h: Household): boolean | null {
  const a = personIncome(h.self);
  const b = h.spouse ? personIncome(h.spouse.person) : "none";
  const has = (v: number | null | "none") => (v === "none" ? false : v === null ? null : v > 0);
  const x = has(a);
  const y = has(b);
  if (x === false || y === false) return false;
  if (x === null || y === null) return null;
  return true;
}

// 행복주택 소득 한도 비율: 기본 100%, 1인 +20%p, 2인 +10%p, 신혼·한부모 맞벌이 120%
function happyPct(rules: Rules, size: number, kind: "single" | "couple", dual: boolean | null): { pct: number; note: string } {
  const hp = rules.rental.happy;
  const bonus = size <= 1 ? hp.singleHouseholdBonus : size === 2 ? hp.twoPersonBonus : 0;
  if (kind === "couple" && dual === true) return { pct: hp.dualIncomePct + bonus, note: "맞벌이" };
  return { pct: hp.incomePct + bonus, note: kind === "couple" && dual === null ? "홑벌이 기준(맞벌이 여부 불명)" : "" };
}

// ───────── 유형별 ─────────
function mk(id: string, name: string, checks: Check[]): TypeResult {
  return { id, name, verdict: verdictOf(checks), checks };
}

function happy(data: PersonalData, h: Household, ref: Date, rules: Rules): TypeResult[] {
  const hp = rules.rental.happy;
  const A = rules.rental.assets;
  const base = common(h, rules);
  const acc = accountInfo(data, ref);
  const sib = siblingNote(data);
  const out: TypeResult[] = [];

  // 청년(사회초년생 포함)
  const age = selfAge(data, ref);
  const ageCk = age === null ? unk("나이", "생년월일이 모름·빈 칸입니다.") : age >= hp.youthAge[0] && age <= hp.youthAge[1] ? ok("나이", `만 ${age}세 (만 ${hp.youthAge[0]}~${hp.youthAge[1]}세)`) : fail("나이", `만 ${age}세 — 청년 계층은 만 ${hp.youthAge[0]}~${hp.youthAge[1]}세`);
  const y = happyPct(rules, h.size, "single", false);
  out.push(mk("행복주택-청년", "행복주택 · 청년", [ageCk, notMarried(data), ...base, incomeVs(h, urbanBase(rules, h.size) * (y.pct / 100), `도시근로자 월평균소득 ${y.pct}%`, "소득 기준", h.size), assetsVs(data, A.youth), acc, ...sib]));

  // 대학생
  const st = data.extra.studentStatus;
  const stCk = st === "대학생" ? ok("대학생", "대학 재학 또는 입·복학 예정") : !known(st) ? unk("대학생", "대학생 여부가 모름·빈 칸입니다.") : fail("대학생", `'${String(st)}'이라 대학생 계층이 아닙니다.`);
  const parents = h.members.filter((m) => m.rec.relation === "부·모");
  const stSize = 1 + parents.length;
  const sh: Household = { ...h, members: parents, size: stSize };
  const sp = happyPct(rules, stSize, "single", false);
  const stIncome = parents.length === 0
    ? unk("소득 기준", "본인과 부모의 소득 합계로 판정하는데, 부모가 같은 등본에 없어 부모 소득을 알 수 없습니다.")
    : incomeVs(sh, urbanBase(rules, stSize) * (sp.pct / 100), `도시근로자 월평균소득 ${sp.pct}%`, "소득 기준(본인+부모)", stSize);
  out.push(mk("행복주택-대학생", "행복주택 · 대학생", [stCk, notMarried(data), ...base, stIncome, assetsVs(data, A.student), acc, ...sib]));

  // 신혼부부
  const dual = dualIncome(h);
  const nw = happyPct(rules, h.size, "couple", dual);
  out.push(mk("행복주택-신혼부부", "행복주택 · 신혼부부", [newlywedElig(data, h, ref, rules), ...base, incomeVs(h, urbanBase(rules, h.size) * (nw.pct / 100), `도시근로자 월평균소득 ${nw.pct}%${nw.note ? `(${nw.note})` : ""}`, "소득 기준", h.size), assetsVs(data, A.general), acc, ...sib]));

  // 한부모
  const kids = kidsUnder(data, h, ref, hp.childMaxAge);
  const spCk = data.basic.singleParent === true
    ? kids.count > 0 ? ok("한부모 자격", `만 ${hp.childMaxAge}세 이하 자녀 ${kids.count}명`) : kids.unknown ? unk("한부모 자격", "자녀 생년월일 또는 태아 수가 모름·빈 칸입니다.") : fail("한부모 자격", `만 ${hp.childMaxAge}세 이하 자녀가 없습니다.`)
    : data.basic.singleParent === false ? fail("한부모 자격", "한부모가 아닙니다.") : unk("한부모 자격", "한부모 여부가 모름·빈 칸입니다.");
  const sg = happyPct(rules, h.size, "couple", false);
  out.push(mk("행복주택-한부모", "행복주택 · 한부모", [spCk, ...base, incomeVs(h, urbanBase(rules, h.size) * (sg.pct / 100), `도시근로자 월평균소득 ${sg.pct}%`, "소득 기준", h.size), assetsVs(data, A.general), acc, ...sib]));

  // 고령자
  const eCk = age === null ? unk("나이", "생년월일이 모름·빈 칸입니다.") : age >= hp.elderAge ? ok("나이", `만 ${age}세 (만 ${hp.elderAge}세 이상)`) : fail("나이", `만 ${age}세 — 고령자 계층은 만 ${hp.elderAge}세 이상`);
  const el = happyPct(rules, h.size, "single", false);
  out.push(mk("행복주택-고령자", "행복주택 · 고령자", [eCk, ...base, incomeVs(h, urbanBase(rules, h.size) * (el.pct / 100), `도시근로자 월평균소득 ${el.pct}%`, "소득 기준", h.size), assetsVs(data, A.general), acc, ...sib]));
  return out;
}

function national(data: PersonalData, h: Household, ref: Date, rules: Rules): TypeResult {
  const n = rules.rental.national;
  const base = urbanBase(rules, h.size);
  const { sum, missing } = incomeTotal(h);
  const pct = (sum / base) * 100;
  const tag = `가구원 ${h.size}명, 월 소득 합계 ${won(sum)}${missing ? "(입력된 분만)" : ""} = 도시근로자 월평균소득의 ${pct.toFixed(0)}%`;
  let inc: Check;
  if (pct > n.gt60) inc = fail("소득 기준", `${tag}. 모든 주택형 기준(최대 ${n.gt60}%)을 넘습니다.`);
  else if (missing) inc = unk("소득 기준", `${tag}. 소득이 모름·빈 칸인 세대원이 있습니다.`);
  else if (pct <= n.lt50) inc = ok("소득 기준", `${tag}. 전용 50㎡ 미만 기준(${n.lt50}%) 이내라 모든 주택형 신청 가능성이 있습니다.`);
  else if (pct <= n.lt60) inc = ok("소득 기준", `${tag}. 전용 50~60㎡ 기준(${n.lt60}%) 이내입니다. 50㎡ 미만 주택형은 ${n.lt50}% 이하만 신청할 수 있습니다.`);
  else inc = unk("소득 기준", `${tag}. 전용 60㎡ 초과 주택형(기준 ${n.gt60}%)만 해당합니다. 공고의 주택형을 확인하세요.`);
  return mk("국민임대", "국민임대", [...common(h, rules), inc, assetsVs(data, rules.rental.assets.general), accountInfo(data, ref), ...siblingNote(data)]);
}

function permanent(data: PersonalData, h: Household, rules: Rules): TypeResult {
  const ss = data.extra.socialStatus;
  const ag = data.extra.agencyClasses;
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  const unknownCls = ss === UNKNOWN || ag === UNKNOWN || ss === undefined || ss === null || ag === undefined || ag === null;
  const recipient = arr(ss).includes("생계·의료급여 수급자");
  const other = arr(ss).some((x) => x === "한부모가족" || x === "고령자" || x === "차상위") || arr(ag).some((x) => ["장애인", "국가유공자", "북한이탈주민"].includes(x));
  const checks: Check[] = [];
  if (recipient) checks.push(ok("우선 계층", "생계·의료급여 수급자 — 1순위 계층"));
  else if (other) checks.push(unk("우선 계층", "한부모·고령자·장애인·유공자 등 해당 계층 순위는 공고문으로 확인하세요."));
  else if (unknownCls) checks.push(unk("우선 계층", "수급자·사회적 지위 항목이 모름·빈 칸입니다."));
  else checks.push(fail("우선 계층", "영구임대는 수급자 등 해당 계층만 신청할 수 있는데 해당하는 계층이 없습니다."));
  checks.push(...common(h, rules));
  if (!recipient) {
    checks.push(incomeVs(h, urbanBase(rules, h.size) * (rules.rental.permanent.incomePct / 100), `도시근로자 월평균소득 ${rules.rental.permanent.incomePct}%`, "소득 기준(수급자 외)"));
  }
  checks.push(assetsVs(data, rules.rental.assets.general), ...siblingNote(data));
  return mk("영구임대", "영구임대", checks);
}

function integrated(data: PersonalData, h: Household, rules: Rules): TypeResult {
  const ig = rules.rental.integrated;
  const t = rules.rental.medianIncome.bySize as Record<string, number>;
  const base = t[String(h.size)];
  let inc: Check;
  if (!base) inc = unk("소득 기준", `가구원 ${h.size}명의 기준 중위소득 표가 앱에 없습니다. 공고문으로 확인하세요(우선 ${ig.priorityPct}%, 일반 ${ig.generalPct}%).`);
  else {
    const { sum, missing } = incomeTotal(h);
    const tag = `가구원 ${h.size}명, 월 소득 합계 ${won(sum)}${missing ? "(입력된 분만)" : ""}, 기준 중위소득 ${won(base)}`;
    if (sum > base * (ig.generalPct / 100)) inc = fail("소득 기준", `${tag}. 일반공급 기준(${ig.generalPct}%)을 넘습니다.`);
    else if (missing) inc = unk("소득 기준", `${tag}. 소득이 모름·빈 칸인 세대원이 있습니다.`);
    else if (sum <= base * (ig.priorityPct / 100)) inc = ok("소득 기준", `${tag}. 우선공급 기준(${ig.priorityPct}%) 이내입니다.`);
    else inc = ok("소득 기준", `${tag}. 우선공급(${ig.priorityPct}%)은 넘지만 일반공급(${ig.generalPct}%) 이내입니다.`);
  }
  return mk("통합공공임대", "통합공공임대", [...common(h, rules), inc, assetsVs(data, rules.rental.assets.general), ...siblingNote(data)]);
}

function publicRental(data: PersonalData, h: Household, ref: Date, rules: Rules): TypeResult {
  const { sum, missing } = incomeTotal(h);
  const lim = urbanBase(rules, h.size);
  const inc = sum > lim * 1.2
    ? fail("소득 기준", `월 소득 합계 ${won(sum)}이 도시근로자 월평균소득 120%(${won(Math.round(lim * 1.2))})를 넘습니다.`)
    : missing || sum > lim
      ? unk("소득 기준", `5·10년 공공임대·분양전환 공공임대의 소득 기준은 공고마다 다릅니다. 월 소득 합계 ${won(sum)}${missing ? "(입력된 분만)" : ""}, 도시근로자 100% ${won(Math.round(lim))}. 공고문을 확인하세요.`)
      : ok("소득 기준", `월 소득 합계 ${won(sum)} ≤ 도시근로자 100% ${won(Math.round(lim))}. 소득 제한이 있어도 이내입니다.`);
  return mk("공공임대", "공공임대(5·10년·분양전환)", [...common(h, rules), inc, assetsVs(data, rules.rental.assets.general), accountInfo(data, ref), ...siblingNote(data)]);
}

function jeonse(data: PersonalData, h: Household, ref: Date, rules: Rules): TypeResult[] {
  const jp = rules.rental.jeonse;
  const hp = rules.rental.happy;
  const base = common(h, rules);
  const out: TypeResult[] = [];
  const age = selfAge(data, ref);
  const ageCk = age === null ? unk("나이", "생년월일이 모름·빈 칸입니다.") : age >= hp.youthAge[0] && age <= hp.youthAge[1] ? ok("나이", `만 ${age}세`) : fail("나이", `만 ${age}세 — 청년은 만 ${hp.youthAge[0]}~${hp.youthAge[1]}세`);
  out.push(mk("매입전세임대-청년", "매입·전세임대 · 청년", [ageCk, notMarried(data), ...base, incomeVs(h, urbanBase(rules, h.size) * (jp.youthPct / 100), `도시근로자 월평균소득 ${jp.youthPct}%`), assetsVs(data, rules.rental.assets.youth), ...siblingNote(data)]));
  const dual = dualIncome(h);
  const pct = dual === true ? jp.newlywedDualPct : jp.newlywedPct;
  out.push(mk("매입전세임대-신혼부부", "매입·전세임대 · 신혼부부", [newlywedElig(data, h, ref, rules), ...base, incomeVs(h, urbanBase(rules, h.size) * (pct / 100), `도시근로자 월평균소득 ${pct}%${dual === true ? "(맞벌이)" : dual === null ? "(맞벌이 여부 불명, 홑벌이 기준)" : ""}`), assetsVs(data, rules.rental.assets.general), ...siblingNote(data)]));
  return out;
}

export function evaluateRental(data: PersonalData, notice: Notice, rules: Rules = RULES, today: Date = new Date()): NoticeResult {
  const { ref, assumed } = refDateOf(notice, today);
  const k = rentalKind(notice);
  const base: NoticeResult = { modeled: k.id !== null, reason: k.reason, refDate: iso(ref), refAssumed: assumed, category: "임대", general: null, specials: [], rentals: [] };
  if (!k.id) return base;
  const h = buildHousehold(data);
  let rentals: TypeResult[] = [];
  switch (k.id) {
    case "행복주택": rentals = happy(data, h, ref, rules); break;
    case "국민임대": rentals = [national(data, h, ref, rules)]; break;
    case "영구임대": rentals = [permanent(data, h, rules)]; break;
    case "통합공공임대": rentals = [integrated(data, h, rules)]; break;
    case "공공임대": rentals = [publicRental(data, h, ref, rules)]; break;
    case "매입전세임대": rentals = jeonse(data, h, ref, rules); break;
  }
  return { ...base, rentals };
}
