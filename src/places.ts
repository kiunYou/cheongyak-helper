// 내 장소(집·회사 + 추가 최대 4개). 이름과 주소 글자만 저장합니다.
// 카카오 로컬 API 결과(좌표 등)는 저장하지 않는 것이 카카오 정책이므로, 좌표는 길찾기를 열 때마다 새로 조회합니다.

export type Place = { id: string; name: string; address: string };

export const MAX_EXTRA = 4;
export const NAME_MAX = 20;
export const ADDRESS_MAX = 200;

export const basePlaces = (): Place[] => [
  { id: "home", name: "집", address: "" },
  { id: "work", name: "회사", address: "" },
];

const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");

/** 저장소에서 읽은 값을 안전하게 정리합니다. 집·회사는 항상 앞에 두 칸으로 있습니다. */
export function normalizePlaces(raw: unknown): Place[] {
  const list = Array.isArray(raw) ? raw : [];
  const find = (id: string) => list.find((p) => p && typeof p === "object" && (p as Record<string, unknown>).id === id) as Record<string, unknown> | undefined;
  const base = basePlaces().map((b) => ({ ...b, address: str(find(b.id)?.address, ADDRESS_MAX) }));
  const seen = new Set(base.map((b) => b.id));
  const extra: Place[] = [];
  for (const p of list) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const id = str(r.id, 40);
    const name = str(r.name, NAME_MAX);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    extra.push({ id, name, address: str(r.address, ADDRESS_MAX) });
    if (extra.length >= MAX_EXTRA) break;
  }
  return [...base, ...extra];
}

export const extraCount = (places: Place[]) => places.length - 2;
export const canAddPlace = (places: Place[]) => extraCount(places) < MAX_EXTRA;
