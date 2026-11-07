// 청약 가이드 내용: 유형별 준비 서류, 공고문에서 추가로 확인할 사항, 전화 문의 질문.
// 판정 결과(NoticeResult)의 '확인 필요/불가' 항목에 맞춘 질문을 함께 만들어 줍니다. 모두 참고용이며 공고문이 최종입니다.
import type { Check, NoticeResult, TypeResult } from "./engine";

const guideOf = (id: string): TypeGuide | undefined => GUIDES[id] ?? GUIDES[id.split("-")[0]];

export type TypeGuide = { documents: string[]; checkInNotice: string[]; questions: string[] };

export const COMMON_DOCUMENTS = [
  "주민등록등본·초본(주소 이동 이력 포함)",
  "가족관계증명서(상세)",
  "청약통장 순위(가입)확인서",
  "건강보험자격득실확인서(소득·세대 확인용)",
  "신분증, 인감 또는 본인서명사실확인서(대리 신청 시)",
];

export const GUIDES: Record<string, TypeGuide> = {
  일반공급: {
    documents: ["주택소유 여부 확인서류(청약홈 주택소유확인 결과)", "자산 확인 서류(부동산·자동차 — 전용 60㎡ 이하인 경우)"],
    checkInNotice: [
      "신청 가능한 주택형(전용면적)과 그 주택형에 자산 기준이 적용되는지",
      "해당지역·기타지역 구분과 거주기간 요건",
      "투기과열지구·청약과열지역 여부(1순위 통장 요건이 달라짐)",
      "순위 안에서 당첨자 선정 방식(납입 총액, 납입 횟수, 추첨 등)",
    ],
    questions: [
      "이번 공고 지역은 투기과열지구 또는 청약과열지역에 해당하나요? 1순위 통장 요건은 몇 개월·몇 회인가요?",
      "제가 신청하려는 주택형에도 자산(부동산·자동차) 기준이 적용되나요?",
      "저는 해당지역 거주자 우선공급 대상이 되나요? 거주기간은 어떻게 계산하나요?",
    ],
  },
  신혼부부: {
    documents: ["혼인관계증명서(상세) 또는 혼인 예정 증빙", "소득 증빙(재직증명서, 근로소득 원천징수영수증 등)", "자녀가 있다면 출생 증빙·태아 임신확인서", "(한부모) 한부모가족증명서 또는 이혼 증빙"],
    checkInNotice: [
      "우선공급과 잔여(일반) 공급의 소득 기준과 맞벌이 기준",
      "예비신혼부부의 혼인 증명 시한(입주 전까지인지)",
      "자녀 수·출산가구 소득 완화가 적용되는 조건",
      "혼인신고일 기준 7년 이내 판단 기준일",
    ],
    questions: [
      "저희 가구는 맞벌이로 보나요? 소득은 어떤 서류의 어떤 항목으로 계산하나요?",
      "혼인신고일이 공고일 기준 7년 이내인지 어떻게 판단하나요?",
      "태아·최근 출생 자녀가 있을 때 소득 완화나 가점은 어떻게 적용되나요?",
    ],
  },
  신생아: {
    documents: ["자녀 출생증명 또는 가족관계증명서", "소득 증빙", "(입양·재혼 가정) 관련 증명서"],
    checkInNotice: ["2세 미만 자녀의 기준일(공고일 기준인지)", "태아·입양 자녀 인정 여부", "우선공급과 잔여 공급의 소득 기준"],
    questions: [
      "자녀가 공고일 기준 2세 미만으로 인정되려면 출생일을 어떻게 판단하나요?",
      "임신 중인 태아도 신청 자격에 포함되나요?",
    ],
  },
  생애최초: {
    documents: ["소득세 납부 증명(소득금액증명원 등, 최근 5개년)", "재직증명서 또는 사업자 증빙", "세대원 전원의 주택 소유 이력 확인 서류", "청약통장 납입 인정 금액 확인"],
    checkInNotice: [
      "소득세 납부 5년 이상 인정 방식(연도별 납부 여부)",
      "1인 가구의 신청 가능 여부와 물량",
      "혼인·자녀 여부에 따른 추첨 순서",
      "청약통장 납입 총액 요건",
    ],
    questions: [
      "소득세 납부 연수는 어떤 서류로, 어떤 기간까지 확인하나요? 근로소득만 해당하나요?",
      "미혼 1인 가구도 이번 공고의 생애최초 특별공급에 신청할 수 있나요?",
      "세대원 중 과거 주택 소유 이력은 어느 범위까지 확인하나요?",
    ],
  },
  다자녀: {
    documents: ["가족관계증명서(상세)와 자녀 주민등록 확인", "태아 임신확인서(해당 시)", "소득 증빙"],
    checkInNotice: ["미성년 자녀 수 기준(태아·입양 포함 여부)", "자녀가 같은 등본에 있어야 하는지", "가점 산정 방식"],
    questions: ["태아와 입양 자녀는 자녀 수에 포함되나요?", "자녀가 다른 등본에 있는 경우도 인정되나요?"],
  },
  노부모부양: {
    documents: ["부모님 주민등록등본(등재일 확인)", "가족관계증명서", "부모님 무주택 확인 서류", "세대주 확인 서류"],
    checkInNotice: ["만 65세 이상 직계존속 3년 이상 부양 인정 기준(등본 등재 기간)", "배우자의 부모 인정 여부", "부양가족 무주택 요건"],
    questions: ["부모님 등재 기간 3년은 어느 날짜부터 어느 날짜까지로 계산하나요?", "부모님이 과거 주택을 소유했다가 처분한 경우도 인정되나요?"],
  },
  행복주택: {
    documents: ["(청년) 재직증명서·소득 증빙, 혼인관계증명서(미혼 확인)", "(대학생) 재학·입학·복학 증빙, 부모 소득 서류", "(신혼·한부모) 혼인·자녀 증빙", "(고령자) 주민등록등본", "입주자저축 가입 확인서(입주 전까지)"],
    checkInNotice: ["공급 계층별 물량(청년·신혼·대학생 등)과 계층별 소득·자산 기준", "청년 계층의 취업 연차 요건(사회초년생)", "해당 단지 지역 거주·직장 우선공급 조건", "임대 기간과 갱신 조건"],
    questions: ["저는 어느 계층(청년·사회초년생 등)으로 신청하는 것이 맞나요?", "같은 등본에 형제자매·부모가 있으면 소득과 가구원 수는 누구까지 포함하나요?", "총자산에 임차보증금이나 예금·부채는 어떻게 반영되나요?"],
  },
  국민임대: {
    documents: ["소득 증빙(건강보험 자격·보험료 납부확인서 등)", "자산 확인 서류(부동산·자동차·금융)", "청약통장 순위확인서(순위 산정용)"],
    checkInNotice: ["신청하려는 주택형(전용면적)별 소득 기준(50%·70%·100%)", "단지 지역 거주 우선공급 요건", "순위·가점 산정 방식"],
    questions: ["제가 신청하려는 주택형의 소득 기준은 몇 %인가요?", "총자산 계산에 포함되는 항목과 제외되는 항목을 알려 주세요.", "청약통장 순위는 어떻게 계산하나요?"],
  },
  영구임대: {
    documents: ["수급자 증명서(해당 시)", "장애인증명서·유공자증 등 계층 증빙", "소득·자산 확인 서류"],
    checkInNotice: ["우선 공급 계층(1순위·2순위) 범위", "소득 기준(수급자 외 50%·70%)과 계층별 예외"],
    questions: ["제가 해당하는 계층의 순위는 몇 순위인가요?", "수급자가 아닌 경우 소득 기준은 몇 %를 적용하나요?"],
  },
  통합공공임대: {
    documents: ["소득 증빙", "자산 확인 서류(부동산·자동차·금융)", "가족관계증명서"],
    checkInNotice: ["우선공급·일반공급 구분과 소득 기준(기준 중위소득 비율)", "소득연동 임대료 산정 방식"],
    questions: ["우선공급과 일반공급은 어떻게 나뉘고 제 소득은 어느 쪽인가요?", "소득이 오르면 임대료는 어떻게 바뀌나요?"],
  },
  공공임대: {
    documents: ["소득·자산 확인 서류", "청약통장 순위확인서"],
    checkInNotice: ["소득 기준이 있는 공고인지와 그 비율", "분양전환 조건(해당 시)", "임대 기간과 임대료"],
    questions: ["이번 공고는 소득 제한이 있나요? 있다면 몇 %인가요?", "분양전환 시점과 조건은 어떻게 되나요?"],
  },
  매입전세임대: {
    documents: ["소득·자산 확인 서류", "혼인관계증명서(신혼 계층)", "가족관계증명서"],
    checkInNotice: ["계층별 소득 기준(청년 100%, 신혼 70%·맞벌이 90% 등)", "전세 임대 가능 금액과 본인 부담", "접수 방식(상시·정기)"],
    questions: ["제 계층(청년·신혼 등)에서 소득·자산 기준은 어떻게 되나요?", "신청 후 주택은 제가 구해야 하나요, 기관이 정해 주나요?"],
  },
  기관추천: {
    documents: ["해당 기관의 추천서(국가보훈부, 지자체, 중소벤처기업 관련 기관 등)", "대상자 증빙(유공자증, 장애인증명서 등)"],
    checkInNotice: ["추천 기관과 추천 접수 일정(공고일 이전에 시작되는 경우가 있음)", "추천 인원과 순위 기준"],
    questions: ["기관 추천은 어느 기관에서, 언제까지 신청해야 하나요?", "추천을 받은 뒤 별도로 청약 신청을 해야 하나요?"],
  },
};

/** '불가/확인 필요' 항목에 맞춘 전화 문의 질문 */
const QUESTION_BY_LABEL: [RegExp, string][] = [
  [/무주택/, "제 세대의 주택 소유 이력(상속·지분·소형주택·분양권)이 무주택으로 인정되는지 어떤 자료로 확인하나요?"],
  [/통장/, "제 청약통장(가입 기간·납입 횟수)이 이번 공고의 순위 요건을 충족하는지 확인해 주세요."],
  [/소득/, "소득은 어떤 서류의 어떤 금액을 기준으로 계산하며, 가구원 수에는 누가 포함되나요?"],
  [/자산/, "부동산·자동차 가액은 어떤 기준(공시가격, 자동차 기준가액)으로 확인하나요?"],
  [/재당첨|당첨 이력|부적격/, "제 과거 당첨·부적격 이력이 이번 공고 신청에 제한이 되는지 확인해 주세요."],
];

export type GuideView = {
  summary: { name: string; verdict: string; checks: Check[] }[];
  openItems: { type: string; check: Check }[]; // 확인 필요 항목
  documents: string[];
  checkInNotice: string[];
  questions: string[];
};

export function buildGuide(r: NoticeResult): GuideView {
  const types: TypeResult[] = [...(r.general ? [r.general] : []), ...r.specials, ...r.rentals];
  const relevant = types.filter((t) => t.verdict !== "불가");
  const docs = new Set<string>(COMMON_DOCUMENTS);
  const checks = new Set<string>();
  const questions: string[] = [];
  for (const t of relevant) {
    const g = guideOf(t.id);
    if (!g) continue;
    g.documents.forEach((d) => docs.add(d));
    g.checkInNotice.forEach((d) => checks.add(d));
    g.questions.forEach((q) => !questions.includes(q) && questions.push(q));
  }
  const openItems: GuideView["openItems"] = [];
  for (const t of relevant) for (const c of t.checks) if (c.status === "unknown") openItems.push({ type: t.name, check: c });
  const dynamic: string[] = [];
  for (const { check } of openItems) {
    for (const [re, q] of QUESTION_BY_LABEL) if (re.test(check.label) && !dynamic.includes(q)) dynamic.push(q);
  }
  return {
    summary: types.map((t) => ({ name: t.name, verdict: t.verdict, checks: t.checks })),
    openItems,
    documents: [...docs],
    checkInNotice: [...checks],
    questions: [...dynamic, ...questions.filter((q) => !dynamic.includes(q))],
  };
}
