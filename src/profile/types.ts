// 개인정보 데이터 모양. 이 값은 Rust 쪽에서 암호화되어 이 PC에만 저장됩니다.
// 모든 칸은 세 가지 상태 중 하나입니다: 값 있음 / 비어 있음(null) / 모름("unknown").

export const UNKNOWN = "unknown" as const;
export type Unknown = typeof UNKNOWN;
export type Rec = Record<string, unknown>;

export type PersonalData = {
  version: 1;
  updatedAt: string;
  completedAt: string | null;
  step: number; // 마지막으로 보던 단계(0부터)
  basic: Rec; // 본인 기본
  residence: Rec; // 거주
  household: Rec; // 세대 단위(임신 중 태아 수 등)
  members: Rec[]; // 세대원 목록 (각 항목에 id)
  persons: Record<string, Rec>; // "self"와 세대원 id별: 주택·소득·이력
  assets: Rec; // 자산(세대 합계)
  account: Rec; // 청약통장
  extra: Rec; // 특공 추가, 임대용 추가, 희망 조건
  slotReports: { category: string; at: string }[]; // "입력할 칸이 없어요" 분류 기록(개인정보 아님)
};

export function emptyData(): PersonalData {
  return {
    version: 1,
    updatedAt: "",
    completedAt: null,
    step: 0,
    basic: {},
    residence: {},
    household: {},
    members: [],
    persons: {},
    assets: {},
    account: {},
    extra: {},
    slotReports: [],
  };
}

function obj(x: unknown): Rec {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Rec) : {};
}

/** 저장소에서 읽은 값(빈 저장소 포함)을 안전하게 PersonalData로 만듭니다. */
export function normalize(raw: Record<string, unknown> | null | undefined): PersonalData {
  const d = emptyData();
  if (!raw || typeof raw !== "object") return d;
  const persons: Record<string, Rec> = {};
  for (const [k, v] of Object.entries(obj(raw.persons))) persons[k] = obj(v);
  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    completedAt: typeof raw.completedAt === "string" ? raw.completedAt : null,
    step: typeof raw.step === "number" ? raw.step : 0,
    basic: obj(raw.basic),
    residence: obj(raw.residence),
    household: obj(raw.household),
    members: Array.isArray(raw.members) ? raw.members.map(obj) : [],
    persons,
    assets: obj(raw.assets),
    account: obj(raw.account),
    extra: obj(raw.extra),
    slotReports: Array.isArray(raw.slotReports)
      ? (raw.slotReports as { category: string; at: string }[]).filter(
          (r) => r && typeof r.category === "string" && typeof r.at === "string",
        )
      : [],
  };
}

export function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}
