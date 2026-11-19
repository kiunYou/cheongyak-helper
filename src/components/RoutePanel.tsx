// 공고 소재지까지 카카오맵 길찾기. 도착지는 후보 중에서 사용자가 고르고, 출발지는 내 장소를 고릅니다.
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { friendly, hasKey, locate, MODES, noticeQueries, routeUrl, preferRegion, searchPlaces, searchUrl, type DestQuery, type Hit, type Mode } from "../kakao";
import type { Notice } from "../notices";
import type { PersonalData } from "../profile/types";
import PlacesEditor, { persistPlaces } from "./PlacesEditor";

type Dest = { hits: Hit[]; level: DestQuery["level"] | null; msg: string; loading: boolean };

export default function RoutePanel({ notice, data, onDataChange }: { notice: Notice; data: PersonalData | null; onDataChange: (d: PersonalData) => void }) {
  const [dest, setDest] = useState<Dest>({ hits: [], level: null, msg: "", loading: false });
  const [pick, setPick] = useState(0);
  const [mode, setMode] = useState<Mode>("traffic");
  const [manual, setManual] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState("");

  async function findDest(queries: DestQuery[]) {
    setDest({ hits: [], level: null, msg: "", loading: true });
    setPick(0);
    try {
      // 공고 상세 페이지의 소재지가 있으면 단지마다 첫 결과를 모아 후보로 보여줍니다.
      const exact: Hit[] = [];
      for (const q of queries.filter((x) => x.level === "주소")) {
        const first = (await searchPlaces(q.query))[0];
        if (first) exact.push({ ...first, name: first.name === first.address ? q.query : first.name });
      }
      if (exact.length) {
        setDest({ hits: exact.slice(0, 5), level: "주소", msg: "", loading: false });
        return;
      }
      for (const q of queries.filter((x) => x.level !== "주소")) {
        const hits = preferRegion(await searchPlaces(q.query), notice.region);
        if (hits.length) {
          setDest({ hits, level: q.level, msg: "", loading: false });
          return;
        }
      }
      setDest({ hits: [], level: null, msg: "공고에서 소재지를 찾지 못했습니다. 아래 검색창에 단지 이름이나 주소를 입력하거나, 공고 원문에서 주소를 확인하세요.", loading: false });
    } catch (e) {
      setDest({ hits: [], level: null, msg: friendly(e), loading: false });
    }
  }

  useEffect(() => {
    setNote("");
    setManual("");
    if (hasKey()) void findDest(noticeQueries(notice));
    else setDest({ hits: [], level: null, msg: "", loading: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice.id]);

  const places = data?.places ?? [];
  const chosen = dest.hits[pick];

  async function open(url: string) {
    try {
      await openUrl(url);
    } catch {
      setNote("브라우저를 열지 못했습니다.");
    }
  }

  async function go(placeId: string) {
    setNote("");
    const place = places.find((p) => p.id === placeId);
    if (!place) return;
    if (!chosen) {
      setNote("도착지를 찾지 못해 카카오맵 검색을 엽니다.");
      await open(searchUrl(`${notice.region} ${notice.title}`));
      return;
    }
    setBusyId(placeId);
    try {
      const from = await locate(place.address);
      if (!from) {
        setNote(`'${place.name}' 주소로 위치를 찾지 못했습니다. 내 장소에서 주소를 다시 골라 주세요.`);
        return;
      }
      await open(routeUrl(mode, { name: place.name, lat: from.lat, lng: from.lng }, { name: chosen.name, lat: chosen.lat, lng: chosen.lng }));
    } catch (e) {
      setNote(friendly(e));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="route-panel">
      <h3>길찾기 (카카오맵)</h3>

      <div className="route-dest">
        <b>도착지(공고 소재지 추정)</b>
        {dest.loading && <p className="muted small">위치를 찾는 중…</p>}
        {dest.msg && <p className="muted small">{dest.msg}</p>}
        {dest.hits.length > 0 && (
          <>
            <p className="muted small">
              {dest.level === "주소" ? "공고 상세 페이지의 소재지로 찾았습니다." : dest.level === "단지" ? "공고 제목에서 찾은 후보입니다. 맞는 위치를 고르세요." : dest.level === "시군구" ? "단지를 찾지 못해 시/군/구 위치로 찾았습니다. 대략적인 위치입니다." : "단지를 찾지 못해 시·도 대표 위치로 찾았습니다. 매우 대략적입니다."} 정확한 단지 위치는 공고문으로 확인하세요.
            </p>
            <ul className="dest-list">
              {dest.hits.slice(0, 5).map((h, i) => (
                <li key={i}>
                  <label className="check">
                    <input type="radio" name="dest" checked={pick === i} onChange={() => setPick(i)} />
                    <span>
                      <b>{h.name}</b> <span className="muted small">{h.address}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="dest-search">
          <input value={manual} placeholder="다른 이름·주소로 찾기" onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => e.key === "Enter" && manual.trim() && void findDest([{ query: manual.trim(), level: "단지" }])} />
          <button type="button" className="secondary" disabled={!manual.trim() || !hasKey()} onClick={() => findDest([{ query: manual.trim(), level: "단지" }])}>
            검색
          </button>
          <button type="button" className="link" onClick={() => open(searchUrl(`${notice.region} ${manual.trim() || notice.title}`))}>
            카카오맵에서 직접 검색
          </button>
        </div>
      </div>

      <div className="chips">
        {MODES.map((m) => (
          <button key={m.id} type="button" className={`chip ${mode === m.id ? "on" : ""}`} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="route-from">
        <b>출발지 선택</b>
        <div className="route-buttons">
          {places.map((p) => (
            <button key={p.id} type="button" className="secondary" disabled={!p.address || busyId !== ""} title={p.address || "주소가 설정되지 않았습니다"} onClick={() => go(p.id)}>
              {busyId === p.id ? "여는 중…" : p.address ? `${p.name}에서` : `${p.name} (주소 없음)`}
            </button>
          ))}
        </div>
        {!hasKey() && <p className="muted small">카카오 키가 설정되지 않아 도착지 자동 찾기와 길찾기 연결을 쓸 수 없습니다. 위의 '카카오맵에서 직접 검색'을 이용하세요.</p>}
        {note && <p className="muted small">{note}</p>}
        <button type="button" className="link" onClick={() => setEditing((v) => !v)}>
          {editing ? "내 장소 편집 닫기" : "내 장소 편집"}
        </button>
        {editing && data && (
          <PlacesEditor
            places={data.places}
            onSave={async (p) => onDataChange(await persistPlaces(data, p))}
            onClose={() => setEditing(false)}
          />
        )}
      </div>
    </section>
  );
}
