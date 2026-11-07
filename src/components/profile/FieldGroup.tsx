// 정의 목록(Def[])을 받아 한 덩어리의 입력 칸들을 그립니다. 표시 조건(showIf)과 반복 목록을 처리합니다.
import type { Def, ListDef } from "../../profile/schema";
import { UNKNOWN, newId, type Rec } from "../../profile/types";
import FieldControl from "./FieldControl";

type GroupProps = { defs: Def[]; rec: Rec; onChange: (next: Rec) => void };

export default function FieldGroup({ defs, rec, onChange }: GroupProps) {
  const set = (key: string, v: unknown) => onChange({ ...rec, [key]: v });
  return (
    <div className="group">
      {defs.map((d) => {
        if (d.showIf && !d.showIf(rec)) return null;
        return d.type === "list" ? (
          <ListEditor key={d.key} def={d} value={rec[d.key]} onChange={(v) => set(d.key, v)} />
        ) : (
          <FieldControl key={d.key} def={d} value={rec[d.key]} onChange={(v) => set(d.key, v)} />
        );
      })}
    </div>
  );
}

type ListProps = { def: ListDef; value: unknown; onChange: (v: unknown) => void };

export function ListEditor({ def, value, onChange }: ListProps) {
  const unknown = value === UNKNOWN;
  const items: Rec[] = Array.isArray(value) ? (value as Rec[]) : [];
  const answered = Array.isArray(value); // [] = 해당 없음 확인

  const add = () => onChange([...items, { id: newId() }]);
  const update = (i: number, next: Rec) => onChange(items.map((it, j) => (j === i ? next : it)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));

  return (
    <div className="list-editor">
      <div className="field-head">
        <span className="field-label">{def.label}</span>
      </div>
      {unknown ? (
        <p className="muted">모름으로 표시했습니다. 이 항목이 필요한 판정은 '확인 필요'로 나옵니다.</p>
      ) : (
        items.map((it, i) => (
          <div className="list-item" key={String(it.id ?? i)}>
            <div className="list-item-head">
              <strong>
                {def.itemName} {i + 1}
              </strong>
              <button type="button" className="link" onClick={() => remove(i)}>
                삭제
              </button>
            </div>
            <FieldGroup defs={def.items} rec={it} onChange={(next) => update(i, next)} />
          </div>
        ))
      )}
      <div className="list-actions">
        {!unknown && (
          <button type="button" className="secondary" onClick={add}>
            + {def.addLabel}
          </button>
        )}
        {!def.plain && !unknown && items.length === 0 && (
          <button type="button" className={`secondary ${answered ? "picked" : ""}`} onClick={() => onChange(answered ? null : [])}>
            {answered ? "✓ 해당 없음" : "해당 없음"}
          </button>
        )}
        {!def.plain && (
          <button type="button" className={`secondary ${unknown ? "picked" : ""}`} onClick={() => onChange(unknown ? null : UNKNOWN)}>
            {unknown ? "✓ 모름 (취소하려면 다시 클릭)" : "모름"}
          </button>
        )}
      </div>
      <p className="field-why">
        {def.why}
        {def.hint ? ` (${def.hint})` : ""}
      </p>
    </div>
  );
}
