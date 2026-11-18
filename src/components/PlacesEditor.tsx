// 내 장소 편집: 집·회사 + 추가 장소(최대 4개). 주소는 검색해서 고르거나 직접 입력합니다.
import { useState } from "react";
import { api, errorMessage } from "../api";
import { friendly, hasKey, searchPlaces, type Hit } from "../kakao";
import { ADDRESS_MAX, MAX_EXTRA, NAME_MAX, canAddPlace, extraCount, type Place } from "../places";
import type { PersonalData } from "../profile/types";

/** 장소를 보관함에 저장합니다. 내 정보를 아직 입력 전이면 '입력 전' 상태는 그대로 둡니다. */
export async function persistPlaces(data: PersonalData, places: Place[]): Promise<PersonalData> {
  const next: PersonalData = { ...data, places, updatedAt: data.updatedAt === "" ? "" : new Date().toISOString() };
  await api.savePersonalData(next as unknown as Record<string, unknown>);
  return next;
}

type Props = { places: Place[]; onSave: (p: Place[]) => Promise<void>; onClose: () => void };

export default function PlacesEditor({ places, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Place[]>(places);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState<{ idx: number; q: string; hits: Hit[]; msg: string; loading: boolean } | null>(null);

  const edit = (i: number, patch: Partial<Place>) => setDraft((d) => d.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  async function runSearch(idx: number, q: string) {
    setSearch({ idx, q, hits: [], msg: "", loading: true });
    try {
      const hits = await searchPlaces(q);
      setSearch({ idx, q, hits, msg: hits.length ? "" : "검색 결과가 없습니다. 다른 이름이나 도로명 주소로 검색해 보세요.", loading: false });
    } catch (e) {
      setSearch({ idx, q, hits: [], msg: friendly(e), loading: false });
    }
  }

  async function save() {
    setError("");
    const cleaned = draft.map((p, i) => ({ ...p, name: i < 2 ? p.name : p.name.trim(), address: p.address.trim() }));
    if (cleaned.some((p, i) => i >= 2 && !p.name)) {
      setError("추가 장소에는 이름을 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      await onSave(cleaned);
      onClose();
    } catch (e) {
      setError(`저장하지 못했습니다: ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="places-editor">
      <p className="muted small">
        장소는 이 PC에 암호화되어 저장되고, 길찾기를 열 때 주소 글자만 카카오에 보내 위치를 찾습니다. 집·회사 외에 {MAX_EXTRA}곳까지 추가할 수 있습니다.
        {!hasKey() && " (지금은 카카오 키가 없어 주소 검색 대신 직접 입력만 가능합니다.)"}
      </p>
      <ul className="places-list">
        {draft.map((p, i) => (
          <li key={p.id}>
            <div className="place-row">
              {i < 2 ? (
                <strong className="place-name">{p.name}</strong>
              ) : (
                <input className="place-name-input" value={p.name} maxLength={NAME_MAX} placeholder="이름 (예: 부모님 댁)" onChange={(e) => edit(i, { name: e.target.value })} />
              )}
              <input className="place-addr" value={p.address} maxLength={ADDRESS_MAX} placeholder="주소 또는 장소 이름" onChange={(e) => edit(i, { address: e.target.value })} />
              <button type="button" className="secondary" disabled={!hasKey() || !p.address.trim()} onClick={() => runSearch(i, p.address)}>
                주소 검색
              </button>
              {i >= 2 && (
                <button type="button" className="secondary" onClick={() => { setDraft((d) => d.filter((_, k) => k !== i)); setSearch(null); }}>
                  삭제
                </button>
              )}
            </div>
            {search && search.idx === i && (
              <div className="place-hits">
                {search.loading && <p className="muted small">검색 중…</p>}
                {search.msg && <p className="muted small">{search.msg}</p>}
                {search.hits.map((h, k) => (
                  <button key={k} type="button" className="place-hit" onClick={() => { edit(i, { address: h.address }); setSearch(null); }}>
                    <b>{h.name}</b>
                    <span className="muted small">{h.address}</span>
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="banner error">{error}</p>}
      <div className="actions">
        <button type="button" className="secondary" disabled={!canAddPlace(draft)} onClick={() => setDraft((d) => [...d, { id: crypto.randomUUID().slice(0, 8), name: "", address: "" }])}>
          + 장소 추가 ({extraCount(draft)}/{MAX_EXTRA})
        </button>
        <button type="button" disabled={busy} onClick={save}>저장</button>
        <button type="button" className="secondary" disabled={busy} onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
