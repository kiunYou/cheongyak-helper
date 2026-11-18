// 카카오 로컬 API(주소·장소 검색)와 카카오맵 길찾기 링크.
// 외부로 나가는 것은 검색어(주소·단지명)를 카카오에 보내는 요청뿐입니다.
import { KAKAO_REST_KEY } from "./config";
import { findSigungu } from "./regions";

export type Hit = { name: string; address: string; lat: number; lng: number };
export type KakaoErrKind = "nokey" | "offline" | "limit" | "auth" | "error";

export class KakaoError extends Error {
  constructor(public kind: KakaoErrKind, message: string) {
    super(message);
  }
}

export const hasKey = () => KAKAO_REST_KEY.trim() !== "";

export function friendly(e: unknown): string {
  if (e instanceof KakaoError) {
    switch (e.kind) {
      case "nokey": return "카카오 키가 설정되지 않아 주소 검색을 쓸 수 없습니다. 주소를 직접 입력하거나 카카오맵 검색 링크를 이용하세요.";
      case "offline": return "인터넷에 연결되어 있지 않거나 카카오에 접속하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.";
      case "limit": return "카카오 무료 사용량을 모두 썼습니다. 내일 다시 시도해 주세요.";
      case "auth": return "카카오 키가 올바르지 않거나 이 앱에서 카카오맵 API가 켜져 있지 않습니다.";
      default: return "카카오에서 결과를 받지 못했습니다. 잠시 뒤 다시 시도하세요.";
    }
  }
  return "위치를 찾는 중 문제가 생겼습니다.";
}

type Doc = Record<string, unknown>;

async function get(path: string, params: Record<string, string>): Promise<Doc[]> {
  if (!hasKey()) throw new KakaoError("nokey", "no key");
  const url = `https://dapi.kakao.com/v2/local/search/${path}.json?${new URLSearchParams(params)}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` }, signal: ctl.signal });
    if (res.status === 401 || res.status === 403) throw new KakaoError("auth", `HTTP ${res.status}`);
    if (res.status === 429) throw new KakaoError("limit", "limit");
    if (res.status === 400) {
      const body = (await res.json().catch(() => ({}))) as { code?: number };
      throw new KakaoError(body.code === -10 ? "limit" : "error", "HTTP 400");
    }
    if (!res.ok) throw new KakaoError("error", `HTTP ${res.status}`);
    const body = (await res.json()) as { documents?: Doc[] };
    return Array.isArray(body.documents) ? body.documents : [];
  } catch (e) {
    if (e instanceof KakaoError) throw e;
    throw new KakaoError("offline", e instanceof Error ? e.message : String(e)); // 네트워크 실패·시간 초과
  } finally {
    clearTimeout(timer);
  }
}

const num = (x: unknown) => (typeof x === "string" || typeof x === "number" ? Number(x) : NaN);
const s = (x: unknown) => (typeof x === "string" ? x : "");

function toHit(d: Doc, fromAddress: boolean): Hit | null {
  const lat = num(d.y);
  const lng = num(d.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (fromAddress) {
    const road = d.road_address as Doc | null | undefined;
    const addr = (road && s(road.address_name)) || s(d.address_name);
    return { name: (road && s(road.building_name)) || addr, address: addr, lat, lng };
  }
  return { name: s(d.place_name), address: s(d.road_address_name) || s(d.address_name), lat, lng };
}

/** 주소·장소 이름으로 검색합니다(주소 검색 → 부족하면 키워드 검색). 최대 8건. */
export async function searchPlaces(query: string): Promise<Hit[]> {
  const q = query.trim();
  if (!q) return [];
  const out: Hit[] = [];
  const seen = new Set<string>();
  const add = (h: Hit | null) => {
    if (!h || !h.address) return;
    const k = `${h.address}|${h.name}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(h);
    }
  };
  (await get("address", { query: q, size: "5" })).forEach((d) => add(toHit(d, true)));
  if (out.length < 5) (await get("keyword", { query: q, size: "8" })).forEach((d) => add(toHit(d, false)));
  return out.slice(0, 8);
}

/** 저장된 주소 글자 하나를 좌표로 바꿉니다(첫 결과). 같은 실행 중에는 메모리에만 잠깐 기억합니다. */
const memo = new Map<string, Hit | null>();
export async function locate(address: string): Promise<Hit | null> {
  const a = address.trim();
  if (!a) return null;
  if (memo.has(a)) return memo.get(a) ?? null;
  const hit = (await searchPlaces(a))[0] ?? null;
  memo.set(a, hit);
  return hit;
}

// ───────── 공고 소재지 추정 ─────────
const DROP_WORDS = [
  "입주자 모집공고", "입주자모집공고", "예비입주자", "입주자 모집", "입주자모집", "잔여세대", "모집공고", "신혼희망타운", "청년안심주택",
  "재개발임대주택", "통합공공임대", "국민임대", "영구임대", "공공임대", "공공분양", "행복주택", "희망하우징", "신혼부부", "일반모집", "추가", "정정", "모집", "공고", "분양", "일반",
];

/** 공고 제목에서 단지·지명 부분만 남깁니다. 남는 게 없으면 빈 글자. */
export function cleanTitle(title: string): string {
  let t = title.replace(/\[[^\]]*\]/g, " ").replace(/\([^)]*\)/g, " ");
  t = t.replace(/\d{4}\s*(?:년|-)?\s*\d*\s*차?/g, " ").replace(/\d+\s*(?:~\s*\d+)?\s*차/g, " ");
  for (const w of DROP_WORDS) t = t.split(w).join(" ");
  return t.replace(/[.,·]+/g, " ").replace(/\s+/g, " ").trim();
}

export type DestQuery = { query: string; level: "단지" | "시군구" | "시도" };

/** 위치 검색에 쓸 검색어를 정확한 것부터 순서대로 만듭니다. */
export function noticeQueries(n: { region: string; title: string }): DestQuery[] {
  const out: DestQuery[] = [];
  const region = (n.region || "").trim();
  const core = cleanTitle(n.title || "");
  if (core.length >= 2) out.push({ query: `${region} ${core}`.trim(), level: "단지" });
  const sido = region.split(/\s+/)[0] || "";
  const sg = sido ? findSigungu(`${region} ${n.title}`, sido) : [];
  if (sido && sg.length) out.push({ query: `${sido} ${sg[0]}`, level: "시군구" });
  if (region) out.push({ query: region, level: "시도" });
  return out;
}

// ───────── 링크 ─────────
export type Mode = "traffic" | "car" | "walk" | "bicycle";
export const MODES: { id: Mode; label: string }[] = [
  { id: "traffic", label: "대중교통" },
  { id: "car", label: "자동차" },
  { id: "walk", label: "도보" },
  { id: "bicycle", label: "자전거" },
];

const seg = (name: string, lat: number, lng: number) => `${encodeURIComponent(name.replace(/[,/]/g, " ").trim() || "장소")},${lat},${lng}`;

export function routeUrl(mode: Mode, from: { name: string; lat: number; lng: number }, to: { name: string; lat: number; lng: number }): string {
  return `https://map.kakao.com/link/by/${mode}/${seg(from.name, from.lat, from.lng)}/${seg(to.name, to.lat, to.lng)}`;
}

/** 키가 없거나 위치를 못 찾을 때 쓰는 카카오맵 검색 링크 */
export const searchUrl = (q: string) => `https://map.kakao.com/link/search/${encodeURIComponent(q.trim())}`;
