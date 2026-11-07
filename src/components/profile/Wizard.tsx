// 내 정보 입력 마법사: 9단계, 단계마다 자동 저장(암호화), "모름"과 "입력할 칸이 없어요" 지원
import { useState } from "react";
import { api, errorMessage } from "../../api";
import { koreanAge } from "../../profile/format";
import {
  ACCOUNT_DEFS, ASSET_DEFS, BASIC_DEFS, EXTRA_DEFS, HOUSEHOLD_DEFS, MEMBERS_DEF, RESIDENCE_DEFS,
  SLOT_CATEGORIES, STEPS, defsForPerson, personsOf, statFor,
} from "../../profile/schema";
import type { PersonalData, Rec } from "../../profile/types";
import FieldGroup, { ListEditor } from "./FieldGroup";

type Props = {
  initial: PersonalData;
  startStep: number;
  onSaved: (d: PersonalData) => void;
  onClose: () => void;
};

export default function Wizard({ initial, startStep, onSaved, onClose }: Props) {
  const [data, setData] = useState<PersonalData>(initial);
  const [step, setStep] = useState(Math.min(Math.max(startStep, 0), STEPS.length - 1));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [slotOpen, setSlotOpen] = useState(false);
  const [slotCat, setSlotCat] = useState(STEPS[step].slotCategory);

  const cur = STEPS[step];

  async function persist(next: PersonalData): Promise<boolean> {
    setError("");
    const toSave: PersonalData = { ...next, updatedAt: new Date().toISOString() };
    try {
      await api.savePersonalData(toSave as unknown as Record<string, unknown>);
      setData(toSave);
      onSaved(toSave);
      return true;
    } catch (e) {
      setError(`저장하지 못했습니다: ${errorMessage(e)}`);
      return false;
    }
  }

  async function go(to: number) {
    setBusy(true);
    const ok = await persist({ ...data, step: to });
    setBusy(false);
    if (ok) {
      setStep(to);
      setMsg("");
      setSlotCat(STEPS[to].slotCategory);
    }
  }

  async function saveOnly() {
    setBusy(true);
    const ok = await persist({ ...data, step });
    setBusy(false);
    if (ok) setMsg("저장했습니다.");
  }

  async function finish() {
    setBusy(true);
    const ok = await persist({ ...data, step, completedAt: new Date().toISOString() });
    setBusy(false);
    if (ok) onClose();
  }

  async function sendSlot() {
    setSlotOpen(false);
    setBusy(true);
    const ok = await persist({
      ...data,
      step,
      slotReports: [...data.slotReports, { category: slotCat, at: new Date().toISOString() }],
    });
    setBusy(false);
    if (ok) setMsg("알려주셔서 감사합니다. 분류 이름만 기록했고, 내용은 어디에도 적지 않았습니다.");
  }

  const patch = (p: Partial<PersonalData>) => {
    setMsg("");
    setData((d) => ({ ...d, ...p }));
  };
  const setPerson = (key: string, rec: Rec) => patch({ persons: { ...data.persons, [key]: rec } });

  function setMembers(v: unknown) {
    const members = Array.isArray(v) ? (v as Rec[]) : [];
    const keep = new Set(["self", ...members.map((m) => String(m.id))]);
    const persons: Record<string, Rec> = {};
    for (const [k, r] of Object.entries(data.persons)) if (keep.has(k)) persons[k] = r;
    patch({ members, persons });
  }

  // 맞벌이는 입력받지 않고 계산합니다(본인과 배우자 모두 소득이 있으면).
  function dualIncomeNote(): string | null {
    const has = (r: Rec) => typeof r.monthlyIncome === "number" && r.monthlyIncome > 0;
    const spouse = data.members.find((m) => m.relation === "배우자");
    if (!spouse) return null;
    const self = data.persons["self"] ?? {};
    const sp = data.persons[String(spouse.id)] ?? {};
    return has(self) && has(sp) ? "본인과 배우자 모두 소득이 있어 '맞벌이'로 계산됩니다. (신혼·신생아 특별공급은 맞벌이 소득 기준이 더 높습니다)" : null;
  }

  function body() {
    switch (cur.id) {
      case "basic":
        return <FieldGroup defs={BASIC_DEFS} rec={data.basic} onChange={(basic) => patch({ basic })} />;
      case "residence":
        return <FieldGroup defs={RESIDENCE_DEFS} rec={data.residence} onChange={(residence) => patch({ residence })} />;
      case "household":
        return (
          <>
            <FieldGroup defs={HOUSEHOLD_DEFS} rec={data.household} onChange={(household) => patch({ household })} />
            <ListEditor def={MEMBERS_DEF} value={data.members} onChange={setMembers} />
          </>
        );
      case "housing":
      case "income":
      case "history": {
        const stepId = cur.id;
        const note = stepId === "income" ? dualIncomeNote() : null;
        return (
          <>
            {personsOf(data).map((p) => {
              const member = data.members.find((m) => String(m.id) === p.key);
              const age = member ? koreanAge(member.birth) : null;
              return (
                <section className="person" key={p.key}>
                  <h3>
                    {p.label}
                    {age !== null ? ` (만 ${age}세)` : ""}
                  </h3>
                  <FieldGroup defs={defsForPerson(stepId, p.isSelf)} rec={p.rec} onChange={(r) => setPerson(p.key, r)} />
                </section>
              );
            })}
            {note && <p className="banner info">{note}</p>}
          </>
        );
      }
      case "assets":
        return <FieldGroup defs={ASSET_DEFS} rec={data.assets} onChange={(assets) => patch({ assets })} />;
      case "account":
        return <FieldGroup defs={ACCOUNT_DEFS} rec={data.account} onChange={(account) => patch({ account })} />;
      case "extra":
        return <FieldGroup defs={EXTRA_DEFS} rec={data.extra} onChange={(extra) => patch({ extra })} />;
    }
  }

  return (
    <div className="wizard">
      <ol className="steps">
        {STEPS.map((s, i) => {
          const st = statFor(s.id, data);
          const done = st.answered + st.unknown > 0 && st.blank === 0;
          return (
            <li key={s.id}>
              <button type="button" className={`step-chip ${i === step ? "on" : ""} ${done ? "done" : ""}`} disabled={busy} onClick={() => go(i)}>
                {i + 1}. {s.title}
                {done ? " ✓" : ""}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="wizard-body">
        <h2>
          {step + 1}단계 · {cur.title}
        </h2>
        <p className="muted">{cur.intro}</p>
        <p className="muted small">
          모르는 칸은 '모름'을 체크하세요. 모름인 항목이 필요한 판정은 '확인 필요'로 표시됩니다. 입력한 내용은 이 PC에 암호화되어 저장되며 밖으로 나가지 않습니다.
        </p>
        {body()}
      </div>

      {error && <p className="banner error">{error}</p>}
      {msg && <p className="banner info">{msg}</p>}

      <div className="wizard-footer">
        <button type="button" className="link" onClick={() => setSlotOpen(true)}>
          내 상황을 입력할 칸이 없어요
        </button>
        <div className="actions">
          <button type="button" className="secondary" disabled={busy} onClick={async () => { await saveOnly(); onClose(); }}>
            저장하고 나가기
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={saveOnly}>
            중간 저장
          </button>
          {step > 0 && (
            <button type="button" className="secondary" disabled={busy} onClick={() => go(step - 1)}>
              이전
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" disabled={busy} onClick={() => go(step + 1)}>
              다음
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={finish}>
              완료
            </button>
          )}
        </div>
      </div>

      {slotOpen && (
        <div className="modal-back" onClick={() => setSlotOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>입력할 칸이 없어요</h3>
            <p className="muted">
              어떤 종류의 정보를 입력할 칸이 없었나요? 분류 이름만 기록하며 내용은 적지 않습니다. 이 분류는 새 입력 칸을 만드는 데에만 쓰입니다.
            </p>
            <select value={slotCat} onChange={(e) => setSlotCat(e.target.value)}>
              {SLOT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="actions">
              <button type="button" className="secondary" onClick={() => setSlotOpen(false)}>
                취소
              </button>
              <button type="button" onClick={sendSlot}>
                알려주기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
