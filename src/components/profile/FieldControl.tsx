// 입력 칸 하나: 종류별 입력 + "모름" + 입력 이유
import { formatKRW, koreanAge } from "../../profile/format";
import type { FieldDef } from "../../profile/schema";
import { UNKNOWN } from "../../profile/types";

type Props = { def: FieldDef; value: unknown; onChange: (v: unknown) => void };

export default function FieldControl({ def, value, onChange }: Props) {
  const unknown = value === UNKNOWN;
  const canUnknown = !def.noUnknown;

  function toggleUnknown(on: boolean) {
    onChange(on ? UNKNOWN : null);
  }

  let input: JSX.Element;
  switch (def.type) {
    case "date":
      input = (
        <input
          type="date"
          min="1900-01-01"
          max="2100-12-31"
          value={typeof value === "string" ? value : ""}
          disabled={unknown}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
      break;
    case "text":
      input = (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          disabled={unknown}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
      break;
    case "select":
      input = (
        <select
          value={typeof value === "string" && !unknown ? value : ""}
          disabled={unknown}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">선택</option>
          {def.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case "bool":
      input = (
        <div className="seg">
          {[
            [true, "예"],
            [false, "아니오"],
          ].map(([v, t]) => (
            <button
              key={String(t)}
              type="button"
              disabled={unknown}
              className={`seg-btn ${value === v ? "on" : ""}`}
              onClick={() => onChange(value === v ? null : v)}
            >
              {String(t)}
            </button>
          ))}
        </div>
      );
      break;
    case "number":
      input = (
        <div className="num-wrap">
          <input
            type="text"
            inputMode="numeric"
            value={typeof value === "number" ? value.toLocaleString("ko-KR") : ""}
            disabled={unknown}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "");
              onChange(digits === "" ? null : Math.min(Number(digits), 1e13));
            }}
          />
          {def.unit && <span className="unit">{def.unit}</span>}
        </div>
      );
      break;
    case "multi": {
      const cur = Array.isArray(value) ? (value as string[]) : [];
      input = (
        <div className="multi">
          {def.options?.map((o) => (
            <label key={o} className="check">
              <input
                type="checkbox"
                disabled={unknown}
                checked={cur.includes(o)}
                onChange={(e) => {
                  const next = e.target.checked ? [...cur, o] : cur.filter((x) => x !== o);
                  onChange(next.length ? next : null);
                }}
              />
              {o}
            </label>
          ))}
        </div>
      );
      break;
    }
  }

  const extra: string[] = [];
  if (def.key === "birth" && typeof value === "string") {
    const a = koreanAge(value);
    if (a !== null) extra.push(`만 ${a}세`);
  }
  if (def.type === "number" && def.unit === "원" && typeof value === "number") extra.push(formatKRW(value));

  return (
    <div className="field">
      <div className="field-head">
        <span className="field-label">{def.label}</span>
        {extra.length > 0 && <span className="field-extra">{extra.join(" · ")}</span>}
      </div>
      <div className="field-row">
        {input}
        {canUnknown && (
          <label className="check unknown">
            <input type="checkbox" checked={unknown} onChange={(e) => toggleUnknown(e.target.checked)} />
            모름
          </label>
        )}
      </div>
      <p className="field-why">
        {def.why}
        {def.hint ? ` (${def.hint})` : ""}
      </p>
    </div>
  );
}
