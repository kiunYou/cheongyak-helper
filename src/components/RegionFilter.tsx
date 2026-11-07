// 희망 지역 막대 + 선택 패널. 선택값은 [적용]을 눌렀을 때만 저장됩니다.
import { useState } from "react";
import { SIGUNGU, emptySel, isFilterOn, sgKey, summarizeSel, type RegionSel } from "../regions";

type Props = { sel: RegionSel; onApply: (s: RegionSel) => Promise<boolean> };

export default function RegionFilter({ sel, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RegionSel>(sel);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const on = isFilterOn(sel);

  const start = () => {
    setDraft(sel);
    setExpanded(sel.sigungu.length ? sel.sidos.filter((s) => sel.sigungu.some((k) => k.startsWith(s + " "))) : []);
    setOpen(true);
  };
  const toggleSido = (s: string) =>
    setDraft((d) =>
      d.sidos.includes(s)
        ? { sidos: d.sidos.filter((x) => x !== s), sigungu: d.sigungu.filter((k) => !k.startsWith(s + " ")) }
        : { ...d, sidos: [...d.sidos, s] },
    );
  const toggleSg = (s: string, name: string) =>
    setDraft((d) => {
      const k = sgKey(s, name);
      const sidos = d.sidos.includes(s) ? d.sidos : [...d.sidos, s];
      return { sidos, sigungu: d.sigungu.includes(k) ? d.sigungu.filter((x) => x !== k) : [...d.sigungu, k] };
    });
  const toggleOpen = (s: string) => setExpanded((e) => (e.includes(s) ? e.filter((x) => x !== s) : [...e, s]));

  async function apply(next: RegionSel) {
    setBusy(true);
    const ok = await onApply(next);
    setBusy(false);
    if (ok) setOpen(false);
  }

  return (
    <div className={`region-bar ${on ? "on" : ""}`}>
      <div className="region-head">
        <span className="region-state">
          {on ? <><strong>📍 희망 지역 필터 켜짐</strong> — {summarizeSel(sel)}</> : <>📍 희망 지역: 전체 지역 (필터 꺼짐)</>}
        </span>
        {!open && (
          <span className="region-actions">
            <button type="button" className="secondary" onClick={start}>{on ? "변경" : "지역 선택"}</button>
            {on && <button type="button" className="secondary" disabled={busy} onClick={() => apply(emptySel())}>해제</button>}
          </span>
        )}
      </div>
      {open && (
        <div className="region-panel">
          <p className="muted small">
            시·도만 체크하면 그 시·도 전체입니다. 「시/군/구」를 열어 체크하면 선택한 곳만 보입니다. 아무것도 체크하지 않고 적용하면 전체 지역입니다.
          </p>
          <ul className="region-list">
            {Object.keys(SIGUNGU).map((s) => {
              const list = SIGUNGU[s];
              const n = draft.sigungu.filter((k) => k.startsWith(s + " ")).length;
              return (
                <li key={s}>
                  <div className="region-row">
                    <label className="check">
                      <input type="checkbox" checked={draft.sidos.includes(s)} onChange={() => toggleSido(s)} />
                      {s}
                    </label>
                    {list.length > 0 && (
                      <button type="button" className="link" onClick={() => toggleOpen(s)}>
                        시/군/구 {expanded.includes(s) ? "접기" : "열기"}{n > 0 ? ` (${n}곳 선택)` : ""}
                      </button>
                    )}
                  </div>
                  {expanded.includes(s) && (
                    <div className="region-sg">
                      {list.map((name) => (
                        <label key={name} className="check">
                          <input type="checkbox" checked={draft.sigungu.includes(sgKey(s, name))} onChange={() => toggleSg(s, name)} />
                          {name}
                        </label>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => apply(draft)}>적용</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}
