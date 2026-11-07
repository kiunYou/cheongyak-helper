// 희망 지역 필터: 시·도별 시/군/구 목록과 공고 지역 맞춤.
// 공고 데이터에는 시·도만 들어 있어서, 시/군/구는 공고 제목(과 지역 글자)에서 찾아 맞춥니다.
import { sidoOf } from "./engine/engine";

export type RegionSel = {
  sidos: string[]; // 선택한 시·도 전체 이름
  sigungu: string[]; // "경기도 평택시" 형태. 한 시·도에 하나라도 있으면 그 시·도는 선택한 곳만 해당
};

export type RegionVerdict = "match" | "unknown" | "hidden";

export const SIGUNGU: Record<string, string[]> = {
  서울특별시: ["종로구", "중구", "용산구", "성동구", "광진구", "동대문구", "중랑구", "성북구", "강북구", "도봉구", "노원구", "은평구", "서대문구", "마포구", "양천구", "강서구", "구로구", "금천구", "영등포구", "동작구", "관악구", "서초구", "강남구", "송파구", "강동구"],
  부산광역시: ["중구", "서구", "동구", "영도구", "부산진구", "동래구", "남구", "북구", "해운대구", "사하구", "금정구", "강서구", "연제구", "수영구", "사상구", "기장군"],
  대구광역시: ["중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군", "군위군"],
  인천광역시: ["중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구", "강화군", "옹진군"],
  광주광역시: ["동구", "서구", "남구", "북구", "광산구"],
  대전광역시: ["동구", "중구", "서구", "유성구", "대덕구"],
  울산광역시: ["중구", "남구", "동구", "북구", "울주군"],
  세종특별자치시: [],
  경기도: ["수원시", "성남시", "의정부시", "안양시", "부천시", "광명시", "평택시", "동두천시", "안산시", "고양시", "과천시", "구리시", "남양주시", "오산시", "시흥시", "군포시", "의왕시", "하남시", "용인시", "파주시", "이천시", "안성시", "김포시", "화성시", "광주시", "양주시", "포천시", "여주시", "연천군", "가평군", "양평군"],
  강원특별자치도: ["춘천시", "원주시", "강릉시", "동해시", "태백시", "속초시", "삼척시", "홍천군", "횡성군", "영월군", "평창군", "정선군", "철원군", "화천군", "양구군", "인제군", "고성군", "양양군"],
  충청북도: ["청주시", "충주시", "제천시", "보은군", "옥천군", "영동군", "증평군", "진천군", "괴산군", "음성군", "단양군"],
  충청남도: ["천안시", "공주시", "보령시", "아산시", "서산시", "논산시", "계룡시", "당진시", "금산군", "부여군", "서천군", "청양군", "홍성군", "예산군", "태안군"],
  전북특별자치도: ["전주시", "군산시", "익산시", "정읍시", "남원시", "김제시", "완주군", "진안군", "무주군", "장수군", "임실군", "순창군", "고창군", "부안군"],
  전라남도: ["목포시", "여수시", "순천시", "나주시", "광양시", "담양군", "곡성군", "구례군", "고흥군", "보성군", "화순군", "장흥군", "강진군", "해남군", "영암군", "무안군", "함평군", "영광군", "장성군", "완도군", "진도군", "신안군"],
  경상북도: ["포항시", "경주시", "김천시", "안동시", "구미시", "영주시", "영천시", "상주시", "문경시", "경산시", "의성군", "청송군", "영양군", "영덕군", "청도군", "고령군", "성주군", "칠곡군", "예천군", "봉화군", "울진군", "울릉군"],
  경상남도: ["창원시", "진주시", "통영시", "사천시", "김해시", "밀양시", "거제시", "양산시", "의령군", "함안군", "창녕군", "고성군", "남해군", "하동군", "산청군", "함양군", "거창군", "합천군"],
  제주특별자치도: ["제주시", "서귀포시"],
};

export const emptySel = (): RegionSel => ({ sidos: [], sigungu: [] });
export const isFilterOn = (s: RegionSel) => s.sidos.length > 0;
export const sgKey = (sido: string, name: string) => `${sido} ${name}`;

/** 저장된 값(extra)에서 선택 상태를 안전하게 꺼냅니다. */
export function selFromExtra(extra: Record<string, unknown>): RegionSel {
  const strs = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);
  const sidos = strs(extra.wishRegions).filter((s) => s in SIGUNGU);
  const sigungu = strs(extra.wishSigungu).filter((k) => {
    const sido = sidos.find((s) => k.startsWith(s + " "));
    return !!sido && SIGUNGU[sido].includes(k.slice(sido.length + 1));
  });
  return { sidos, sigungu };
}

const SHORT: Record<string, string[]> = {
  서울특별시: ["서울특별시", "서울시", "서울"], 부산광역시: ["부산광역시", "부산시", "부산"], 대구광역시: ["대구광역시", "대구시", "대구"],
  인천광역시: ["인천광역시", "인천시", "인천"], 광주광역시: ["광주광역시", "광주시", "광주"], 대전광역시: ["대전광역시", "대전시", "대전"],
  울산광역시: ["울산광역시", "울산시", "울산"], 세종특별자치시: ["세종특별자치시", "세종시", "세종"], 경기도: ["경기도", "경기"],
  강원특별자치도: ["강원특별자치도", "강원도", "강원"], 충청북도: ["충청북도", "충북"], 충청남도: ["충청남도", "충남"],
  전북특별자치도: ["전북특별자치도", "전라북도", "전북"], 전라남도: ["전라남도", "전남"], 경상북도: ["경상북도", "경북"],
  경상남도: ["경상남도", "경남"], 제주특별자치도: ["제주특별자치도", "제주도", "제주"],
};

const HANGUL = "[가-힣]";

/** 글자에서 해당 시·도 안의 시/군/구 이름을 모두 찾습니다. */
export function findSigungu(text: string, sido: string): string[] {
  // 시·도 이름이 시/군/구 앞에 붙은 경우("인천계양")를 풀어 주기 위해 시·도 글자는 공백으로 바꿉니다.
  let t = text;
  for (const s of SHORT[sido] ?? []) t = t.split(s).join(" ");
  const found: string[] = [];
  for (const name of SIGUNGU[sido] ?? []) {
    const stem = name.slice(0, -1);
    const full = new RegExp(`(?<!${HANGUL})${name}`);
    // 2글자 이상 줄임말(평택, 계양)도 인정합니다. 한 글자 줄임말(중, 동)은 오탐이 많아 제외합니다.
    const short = stem.length >= 2 ? new RegExp(`(?<!${HANGUL})${stem}`) : null;
    if (full.test(t) || (short && short.test(t))) found.push(name);
  }
  return found;
}

export type RegionCheck = { verdict: RegionVerdict; sido: string | null; why?: "sido" | "sigungu" };

/** 공고가 선택한 지역에 맞는지: match(맞음), unknown(판단 불가→보여줌), hidden(가려짐). */
export function regionCheck(n: { region: string; title: string }, sel: RegionSel): RegionCheck {
  if (!isFilterOn(sel)) return { verdict: "match", sido: null };
  const sido = sidoOf(n.region || "") ?? sidoOf(n.title || "");
  if (!sido) return { verdict: "unknown", sido: null, why: "sido" };
  if (!sel.sidos.includes(sido)) return { verdict: "hidden", sido };
  const picked = sel.sigungu.filter((k) => k.startsWith(sido + " ")).map((k) => k.slice(sido.length + 1));
  if (picked.length === 0) return { verdict: "match", sido };
  const found = findSigungu(`${n.region} ${n.title}`, sido);
  if (found.length === 0) return { verdict: "unknown", sido, why: "sigungu" };
  return { verdict: found.some((f) => picked.includes(f)) ? "match" : "hidden", sido };
}

/** 막대에 보여줄 요약 글자 */
export function summarizeSel(sel: RegionSel): string {
  const short = (s: string) => (SHORT[s] ? SHORT[s][SHORT[s].length - 1] : s);
  return sel.sidos
    .map((s) => {
      const picked = sel.sigungu.filter((k) => k.startsWith(s + " ")).map((k) => k.slice(s.length + 1));
      return picked.length ? `${short(s)}(${picked.join(", ")})` : short(s);
    })
    .join(" · ");
}
