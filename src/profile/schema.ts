// 입력 항목 정의. 화면(마법사), 통계, 이후 자격 판정 규칙이 모두 이 정의를 기준으로 합니다.
// 항목마다 "입력 이유"를 함께 두어 사용자가 왜 묻는지 바로 알 수 있게 합니다.
import { UNKNOWN, type PersonalData, type Rec } from "./types";

export type FieldType = "date" | "select" | "bool" | "number" | "text" | "multi";

export type FieldDef = {
  type: FieldType;
  key: string;
  label: string;
  why: string; // 입력 이유
  hint?: string;
  options?: string[];
  unit?: string; // 숫자 단위: 원, 회, ㎡, 명, 년
  noUnknown?: boolean; // "모름" 선택지를 두지 않을 항목
  selfOnly?: boolean; // 본인에게만 묻는 항목(주택·소득·이력 단계)
  showIf?: (r: Rec) => boolean;
};

export type ListDef = {
  type: "list";
  key: string;
  label: string;
  why: string;
  hint?: string;
  itemName: string;
  addLabel: string;
  items: FieldDef[];
  plain?: boolean; // true: "없음/모름" 없이 항상 추가 버튼만(세대원 목록)
  selfOnly?: boolean;
  showIf?: (r: Rec) => boolean;
};

export type Def = FieldDef | ListDef;

export const SIDO = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시",
  "세종특별자치시", "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도",
  "전라남도", "경상북도", "경상남도", "제주특별자치도",
];

const is = (key: string, ...vals: unknown[]) => (r: Rec) => vals.includes(r[key]);
const not = (key: string, val: unknown) => (r: Rec) => r[key] !== val;

// ───────── A. 본인 기본 ─────────
export const BASIC_DEFS: Def[] = [
  { type: "date", key: "birth", label: "생년월일", why: "청년(만 19~39세) 여부와 만 30세 기준 무주택 기간을 계산합니다." },
  {
    type: "select", key: "marital", label: "혼인 상태", options: ["미혼", "기혼", "예비신혼", "이혼", "사별"],
    why: "신혼부부·한부모·청년 특별공급을 구분합니다.",
  },
  {
    type: "date", key: "marriageDate", label: "혼인신고일", showIf: is("marital", "기혼"),
    why: "신혼 7년 이내 여부와 무주택 기간 시작일을 계산합니다.",
  },
  {
    type: "date", key: "weddingPlanned", label: "혼인 예정일", showIf: is("marital", "예비신혼"),
    why: "예비신혼부부 특별공급 자격을 확인합니다.",
  },
  {
    type: "bool", key: "singleParent", label: "한부모 여부", showIf: not("marital", "미혼"),
    why: "한부모 가족 우선공급과 신혼부부 특별공급의 한부모 유형을 확인합니다.",
  },
  { type: "bool", key: "isHead", label: "세대주입니까?", why: "노부모부양 특별공급과 일부 공고의 1순위 요건에 쓰입니다." },
  {
    type: "select", key: "relationToHead", label: "세대주와의 관계", showIf: not("isHead", true),
    options: ["배우자", "자녀", "부모", "형제자매", "기타"],
    why: "같은 세대로 보는 범위를 판단합니다.",
  },
  {
    type: "date", key: "headSince", label: "세대주가 된 날", showIf: is("isHead", true),
    why: "세대주 기간을 요구하는 공고에 대비합니다.",
  },
];

// ───────── B. 거주 ─────────
export const RESIDENCE_DEFS: Def[] = [
  { type: "select", key: "sido", label: "주민등록상 시·도", options: SIDO, why: "해당지역 우선공급과 지역 제한 공고를 판단합니다." },
  {
    type: "text", key: "sigungu", label: "시·군·구", hint: "예: 송파구",
    why: "시·군·구 단위로 우선공급이 나뉘는 공고를 판단합니다.",
  },
  {
    type: "date", key: "sidoSince", label: "현재 시·도 연속 거주 시작일",
    why: "우선공급 거주기간(공고마다 1년·2년 등)을 계산합니다.",
    hint: "주민등록초본의 '주소 이동 사항'에서 현재 시·도에 처음 전입한 날입니다.",
  },
  {
    type: "date", key: "capitalSince", label: "수도권 연속 거주 시작일",
    why: "해당지역과 기타지역(수도권)을 구분합니다.",
    hint: "서울·경기·인천 안에서만 옮겨 다녔다면 그 전체 기간의 시작일입니다.",
  },
  {
    type: "list", key: "overseas", label: "최근 해외 체류", itemName: "체류", addLabel: "체류 추가",
    why: "일정 기간을 넘는 해외 체류는 거주기간으로 인정되지 않습니다.",
    hint: "최근 2년 안에 해외에 머문 기간만 입력하세요.",
    items: [
      { type: "date", key: "out", label: "출국일", why: "체류 시작일", noUnknown: true },
      { type: "date", key: "in", label: "입국일", why: "체류 종료일", noUnknown: true },
    ],
  },
  { type: "select", key: "workSido", label: "직장 소재 시·도", options: ["해당 없음", ...SIDO], why: "근무지 기준 자격을 두는 임대 공고에 쓰입니다." },
];

// ───────── C. 세대 구성 ─────────
export const HOUSEHOLD_DEFS: Def[] = [
  {
    type: "number", key: "fetusCount", label: "임신 중 태아 수 (본인 또는 배우자)", unit: "명",
    why: "다자녀·신혼·신생아 특별공급의 자녀 수에 포함됩니다. 없으면 0.",
  },
];

export const REL_OPTIONS = ["배우자", "부·모", "배우자의 부·모", "조부모", "자녀", "손자녀", "형제자매", "기타"];

export const MEMBERS_DEF: ListDef = {
  type: "list", key: "members", label: "세대원", itemName: "세대원", addLabel: "세대원 추가", plain: true,
  why: "무주택세대구성원 범위와 자녀 수, 부양 가족을 판단합니다.",
  hint: "주민등록등본에 함께 올라 있는 가족과, 등본이 달라도 세대원으로 보는 배우자를 입력하세요. 혼자 사시면 비워 두세요.",
  items: [
    { type: "select", key: "relation", label: "본인과의 관계", options: REL_OPTIONS, why: "형제자매는 보통 세대원 범위에서 제외됩니다." },
    { type: "date", key: "birth", label: "생년월일", why: "미성년 자녀 수, 만 65세 이상 부양, 신생아 여부를 계산합니다." },
    { type: "bool", key: "registered", label: "같은 등본에 올라 있습니까?", why: "세대 범위와 노부모 부양 판단에 쓰입니다." },
    {
      type: "date", key: "registeredDate", label: "등본 등재일", showIf: is("registered", true),
      why: "노부모를 3년 이상 부양했는지 계산합니다.",
    },
    {
      type: "bool", key: "separatedSpouse", label: "배우자가 분리세대입니까?", showIf: is("relation", "배우자"),
      why: "배우자는 등본이 달라도 세대원으로 봅니다.",
    },
    {
      type: "bool", key: "marriedChild", label: "자녀가 혼인했습니까?", showIf: is("relation", "자녀"),
      why: "미혼 자녀만 자녀 수에 포함됩니다.",
    },
    {
      type: "bool", key: "adopted", label: "입양한 자녀입니까?", showIf: is("relation", "자녀", "손자녀"),
      why: "입양 자녀의 자녀 수 인정 여부를 판단합니다.",
    },
  ],
};

// ───────── D. 주택·분양권 소유 (본인과 세대원별) ─────────
export const HOUSING_DEFS: Def[] = [
  {
    type: "bool", key: "owns", label: "현재 주택을 소유하고 있습니까?",
    why: "무주택세대구성원 여부는 모든 공공분양의 기본 요건입니다.",
  },
  {
    type: "list", key: "houses", label: "소유 주택", itemName: "주택", addLabel: "주택 추가", showIf: is("owns", true),
    why: "소형·저가주택 예외, 상속·지분 예외, 무주택 기간을 판단합니다.",
    items: [
      { type: "number", key: "area", label: "전용면적", unit: "㎡", why: "소형주택 예외 기준(㎡)" },
      { type: "number", key: "price", label: "공시가격", unit: "원", why: "저가주택 예외 기준" },
      { type: "text", key: "region", label: "소재 지역", hint: "예: 서울 송파구", why: "지역별 예외 기준" },
      { type: "date", key: "acquired", label: "취득일", why: "무주택 기간 계산" },
      { type: "date", key: "disposed", label: "처분일(팔았다면)", why: "처분 후 무주택 기간 계산", noUnknown: true },
      { type: "select", key: "via", label: "취득 경위", options: ["매수", "상속", "공유지분"], why: "상속·지분 예외 적용 여부" },
    ],
  },
  {
    type: "bool", key: "hadBefore", label: "과거에 주택을 소유한 적이 있습니까?", showIf: not("owns", true),
    why: "생애최초 특별공급은 세대원 전원이 과거에도 소유한 적이 없어야 합니다.",
  },
  {
    type: "date", key: "lastDisposed", label: "가장 최근 처분일", showIf: is("hadBefore", true),
    why: "처분 이후 무주택 기간을 계산합니다.",
  },
  { type: "bool", key: "hasRight", label: "분양권·입주권을 보유하고 있습니까?", why: "일정 시점 이후 취득한 분양권은 주택 소유로 봅니다." },
  { type: "date", key: "rightDate", label: "분양권·입주권 취득일", showIf: is("hasRight", true), why: "소유 간주 시점 판단" },
];

// ───────── E. 소득 (세대원별) ─────────
export const INCOME_DEFS: Def[] = [
  {
    type: "select", key: "incomeType", label: "소득 종류", options: ["근로", "사업", "기타", "없음"],
    why: "소득을 계산하는 방식이 종류마다 다릅니다.",
  },
  {
    type: "number", key: "monthlyIncome", label: "월평균 소득(세전)", unit: "원", showIf: not("incomeType", "없음"),
    why: "전년도 도시근로자 월평균소득 대비 비율을 계산합니다.",
    hint: "근로소득은 연 소득(원천징수영수증 총급여)을 12로 나눈 금액입니다.",
  },
  {
    type: "bool", key: "working", label: "현재 근로·사업 중입니까?", showIf: not("incomeType", "없음"),
    why: "생애최초 특별공급 요건입니다.",
  },
  {
    type: "number", key: "taxYears", label: "소득세 납부 연도 수", unit: "년", showIf: not("incomeType", "없음"),
    why: "생애최초 특별공급의 '5년 이상 납부' 요건입니다.",
  },
];

// ───────── F. 자산 (세대 합계) ─────────
export const ASSET_DEFS: Def[] = [
  { type: "number", key: "realEstate", label: "부동산 가액 (토지+건물)", unit: "원", why: "공공분양 자산 기준(세대 합계)입니다.", hint: "세대원 전체의 합계를 입력하세요." },
  { type: "number", key: "vehicle", label: "자동차 가액", unit: "원", why: "공공분양·임대의 자동차 기준입니다.", hint: "세대원 중 가장 비싼 차의 기준가액입니다." },
  { type: "number", key: "financial", label: "금융자산", unit: "원", why: "임대주택 총자산과 청년 특별공급 순자산 기준에 쓰입니다." },
  { type: "number", key: "debt", label: "부채", unit: "원", why: "순자산 계산에 쓰입니다." },
  { type: "number", key: "parentAssets", label: "부모 자산", unit: "원", why: "청년 특별공급과 청년 임대 일부 공고의 부모 자산 기준입니다.", hint: "해당하지 않으면 0." },
];

// ───────── G. 청약통장 ─────────
export const ACCOUNT_DEFS: Def[] = [
  {
    type: "select", key: "type", label: "통장 종류",
    options: ["주택청약종합저축", "청약저축", "청약예금", "청약부금", "없음"],
    why: "공공분양에 신청할 수 있는 통장인지 확인합니다.",
  },
  { type: "date", key: "joinDate", label: "가입일", showIf: not("type", "없음"), why: "1순위 가입기간을 계산합니다." },
  { type: "number", key: "payCount", label: "납입 인정 회차", unit: "회", showIf: not("type", "없음"), why: "1순위 회차와 임대 순위에 쓰입니다." },
  {
    type: "number", key: "payTotal", label: "납입 인정 총액", unit: "원", showIf: not("type", "없음"),
    why: "공공분양 일반공급 당첨자 선정(저축총액 순)에 쓰입니다.",
  },
  {
    type: "number", key: "minorPayCount", label: "미성년 기간 납입 회차", unit: "회", showIf: not("type", "없음"),
    why: "미성년 기간 납입분의 인정 한도를 계산합니다.",
  },
];

// ───────── H. 당첨·제한 이력 (본인과 세대원) ─────────
export const HISTORY_DEFS: Def[] = [
  {
    type: "list", key: "wins", label: "과거 당첨 이력", itemName: "당첨", addLabel: "당첨 추가",
    why: "재당첨 제한 기간을 확인합니다.",
    items: [
      { type: "date", key: "date", label: "당첨일", why: "재당첨 제한 기산일" },
      { type: "select", key: "houseKind", label: "주택 종류", options: ["공공분양", "민간분양", "공공임대", "기타"], why: "종류별 제한 기간이 다릅니다." },
      { type: "select", key: "supply", label: "공급 유형", options: ["일반공급", "특별공급"], why: "특별공급은 원칙적으로 평생 1회입니다." },
    ],
  },
  { type: "bool", key: "specialWon", label: "특별공급으로 당첨된 적이 있습니까?", why: "특별공급은 원칙적으로 평생 1회만 가능합니다." },
  { type: "bool", key: "disqualified", label: "부적격 당첨 이력이 있습니까?", why: "부적격 당첨자는 일정 기간 청약이 제한됩니다." },
  { type: "date", key: "disqualifiedDate", label: "부적격 당첨 통보일", showIf: is("disqualified", true), why: "제한 기간 계산" },
  { type: "bool", key: "inPublicRental", label: "현재 공공임대주택에 거주합니까?", selfOnly: true, why: "임대 중복 입주 제한과 퇴거 조건을 확인합니다." },
  {
    type: "select", key: "publicRentalType", label: "거주 중인 공공임대 유형", selfOnly: true, showIf: is("inPublicRental", true),
    options: ["영구임대", "국민임대", "행복주택", "공공임대(5·10년)", "매입·전세임대", "기타"],
    why: "유형별 중복 신청 가능 여부가 다릅니다.",
  },
];

// ───────── I·J·K. 특별공급 추가, 임대용 추가, 희망 조건 ─────────
export const EXTRA_DEFS: Def[] = [
  {
    type: "multi", key: "agencyClasses", label: "해당되는 분류 (기관추천 특별공급)",
    options: ["국가유공자", "장애인", "중소기업 근로자", "장기복무 군인", "북한이탈주민", "다문화가족", "해당 없음"],
    why: "추천은 기관이 하므로 '추천 신청 가능성 있음'까지만 안내합니다.",
  },
  {
    type: "multi", key: "socialStatus", label: "사회적 지위 (임대주택)",
    options: ["생계·의료급여 수급자", "차상위", "한부모가족", "고령자", "해당 없음"],
    why: "영구임대·국민임대 우선순위에 쓰입니다.",
  },
  { type: "select", key: "studentStatus", label: "대학생·취업준비생 여부", options: ["대학생", "취업준비생", "해당 없음"], why: "행복주택 계층 구분에 쓰입니다." },
  { type: "select", key: "housingForm", label: "현재 거주 형태", options: ["자가", "전세", "월세", "부모 집", "공공임대"], why: "일부 임대의 가점·우선 조건에 쓰입니다." },
  { type: "multi", key: "wishRegions", label: "희망 지역 (목록 필터용)", options: SIDO, why: "공고 목록을 걸러 보여주는 데만 쓰이고 자격 판정에는 쓰이지 않습니다.", noUnknown: true },
  { type: "select", key: "wishKind", label: "분양·임대 선호", options: ["분양", "임대", "둘 다"], why: "목록 필터용입니다.", noUnknown: true },
  { type: "number", key: "wishAreaMin", label: "희망 면적 최소", unit: "㎡", why: "목록 필터용입니다.", noUnknown: true },
  { type: "number", key: "wishAreaMax", label: "희망 면적 최대", unit: "㎡", why: "목록 필터용입니다.", noUnknown: true },
];

// ───────── 단계 ─────────
export type StepId = "basic" | "residence" | "household" | "housing" | "income" | "assets" | "account" | "history" | "extra";

export type StepDef = { id: StepId; title: string; intro: string; slotCategory: string };

export const STEPS: StepDef[] = [
  { id: "basic", title: "기본", intro: "본인에 대한 기본 정보입니다.", slotCategory: "본인 기본 정보" },
  { id: "residence", title: "거주", intro: "주민등록 기준의 거주 지역과 기간입니다.", slotCategory: "거주·지역" },
  { id: "household", title: "세대", intro: "함께 사는 가족과 세대원을 입력합니다. 이후 단계(주택·소득·이력)에서 이 세대원별로 입력하게 됩니다.", slotCategory: "세대 구성" },
  { id: "housing", title: "주택", intro: "본인과 세대원 각각의 주택·분양권 소유 현황입니다.", slotCategory: "주택·분양권 소유" },
  { id: "income", title: "소득", intro: "본인과 세대원 각각의 소득입니다. 기준 금액은 앱이 알고 있으니 내 금액만 입력하세요.", slotCategory: "소득" },
  { id: "assets", title: "자산", intro: "세대 전체의 자산입니다.", slotCategory: "자산" },
  { id: "account", title: "청약통장", intro: "청약통장 정보입니다. 은행 앱이나 청약홈에서 확인할 수 있습니다.", slotCategory: "청약통장" },
  { id: "history", title: "이력", intro: "당첨·제한 이력입니다. 본인과 세대원 각각 입력합니다.", slotCategory: "당첨·제한 이력" },
  { id: "extra", title: "추가·희망", intro: "특별공급·임대주택용 추가 항목과 보고 싶은 공고 조건입니다. 해당 없으면 건너뛰어도 됩니다.", slotCategory: "특별공급·임대 자격" },
];

export const SLOT_CATEGORIES = [...STEPS.map((s) => s.slotCategory), "기타"];

// ───────── 대상 정의와 통계 ─────────
export type Person = { key: string; label: string; rec: Rec; isSelf: boolean };

export function personsOf(data: PersonalData): Person[] {
  const out: Person[] = [{ key: "self", label: "본인", rec: data.persons["self"] ?? {}, isSelf: true }];
  data.members.forEach((m, i) => {
    const id = String(m.id ?? i);
    const rel = typeof m.relation === "string" ? m.relation : "세대원";
    out.push({ key: id, label: `${rel} ${i + 1}`, rec: data.persons[id] ?? {}, isSelf: false });
  });
  return out;
}

export function defsForPerson(step: "housing" | "income" | "history", isSelf: boolean): Def[] {
  const defs = step === "housing" ? HOUSING_DEFS : step === "income" ? INCOME_DEFS : HISTORY_DEFS;
  return defs.filter((d) => isSelf || !d.selfOnly);
}

export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

export type Stat = { answered: number; unknown: number; blank: number };

function tally(defs: Def[], rec: Rec, s: Stat) {
  for (const d of defs) {
    if (d.showIf && !d.showIf(rec)) continue;
    if (d.type !== "list" && d.noUnknown) continue; // 선택 항목(희망 조건)은 통계에서 제외
    const v = rec[d.key];
    if (v === UNKNOWN) s.unknown += 1;
    else if (d.type === "list") {
      if (Array.isArray(v)) s.answered += 1; // [] = "해당 없음"으로 직접 표시
      else s.blank += 1;
    } else if (isBlank(v)) s.blank += 1;
    else s.answered += 1;
  }
}

export function statFor(step: StepId, data: PersonalData): Stat {
  const s: Stat = { answered: 0, unknown: 0, blank: 0 };
  switch (step) {
    case "basic": tally(BASIC_DEFS, data.basic, s); break;
    case "residence": tally(RESIDENCE_DEFS, data.residence, s); break;
    case "household":
      tally(HOUSEHOLD_DEFS, data.household, s);
      data.members.forEach((m) => tally(MEMBERS_DEF.items, m, s));
      break;
    case "housing": case "income": case "history":
      for (const p of personsOf(data)) tally(defsForPerson(step, p.isSelf), p.rec, s);
      break;
    case "assets": tally(ASSET_DEFS, data.assets, s); break;
    case "account": tally(ACCOUNT_DEFS, data.account, s); break;
    case "extra": tally(EXTRA_DEFS, data.extra, s); break;
  }
  return s;
}

export function totalStat(data: PersonalData): Stat {
  const t: Stat = { answered: 0, unknown: 0, blank: 0 };
  for (const st of STEPS) {
    const s = statFor(st.id, data);
    t.answered += s.answered; t.unknown += s.unknown; t.blank += s.blank;
  }
  return t;
}
