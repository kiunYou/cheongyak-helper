// "나에게 맞는 공고" 탭: 내 정보 입력 상태 요약과 수정 진입, 그 아래에 공고별 판정.
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api";
import { STEPS, statFor, totalStat } from "../../profile/schema";
import { normalize, type PersonalData } from "../../profile/types";
import type { Feed, Notice } from "../../notices";
import { selFromExtra, type RegionSel } from "../../regions";
import MatchList from "../MatchList";
import Wizard from "./Wizard";

/** 접힌 상태에서 보여줄 한 줄 요약. 값이 있는 항목만 씁니다(모름·빈 칸은 뺌). */
function oneLine(d: PersonalData, answered: number, all: number): string {
  const parts: string[] = [];
  const b = typeof d.basic.birth === "string" ? d.basic.birth : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(b);
  if (m) {
    const now = new Date();
    let age = now.getFullYear() - Number(m[1]);
    if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) age -= 1;
    if (age >= 0 && age < 120) parts.push(`만 ${age}세`);
  }
  for (const v of [d.basic.marital]) if (typeof v === "string" && v !== "unknown" && v) parts.push(v);
  const sido = d.residence.sido;
  if (typeof sido === "string" && sido !== "unknown" && sido) parts.push(`거주 ${sido}`);
  parts.push(`입력 ${answered}/${all}`);
  return parts.join(" · ");
}

export default function MyInfo({ feed, onSelect }: { feed: Feed | null; onSelect: (n: Notice) => void }) {
  const [data, setData] = useState<PersonalData | null>(null);
  const [error, setError] = useState("");
  const [wizard, setWizard] = useState<{ start: number } | null>(null);
  const [collapsed, setCollapsed] = useState(true); // 탭을 열면 접힌 상태로 시작

  useEffect(() => {
    api
      .loadPersonalData()
      .then((raw) => setData(normalize(raw)))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function saveRegion(sel: RegionSel): Promise<boolean> {
    if (!data) return false;
    const next: PersonalData = { ...data, extra: { ...data.extra, wishRegions: sel.sidos, wishSigungu: sel.sigungu }, updatedAt: new Date().toISOString() };
    try {
      await api.savePersonalData(next as unknown as Record<string, unknown>);
      setData(next);
      setError("");
      return true;
    } catch (e) {
      setError(`희망 지역을 저장하지 못했습니다: ${errorMessage(e)}`);
      return false;
    }
  }

  if (error && !data) return <p className="banner error">{error}</p>;
  if (!data) return <p className="muted">불러오는 중…</p>;

  if (wizard) {
    return <Wizard initial={data} startStep={wizard.start} onSaved={setData} onClose={() => setWizard(null)} />;
  }

  const started = data.updatedAt !== "";
  const completed = data.completedAt !== null;
  const total = totalStat(data);
  const all = total.answered + total.unknown + total.blank;

  if (!started) {
    return (
      <div className="card wide">
        <h1>내 정보를 입력해 주세요</h1>
        <p>
          내 정보를 한 번 입력하면 신청 가능한 공고를 특별공급·일반공급으로 나눠 보여줄 수 있습니다. 모든 항목에 '모름'을 고를 수 있고, 중간에 저장하고 나갔다가 이어서 입력할 수 있습니다.
        </p>
        <p className="muted">입력한 내용은 이 PC에 암호화되어 저장되며 개발자를 포함해 누구에게도 전송되지 않습니다. 약 10~15분 걸립니다. 등본과 청약통장 정보를 옆에 준비하세요.</p>
        <div className="actions">
          <button type="button" onClick={() => setWizard({ start: 0 })}>
            입력 시작
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="myinfo">
      <div className="card wide myinfo-card">
        <button
          type="button"
          className="myinfo-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
        >
          <span className="myinfo-title">
            {completed ? "내 정보 입력 현황" : "입력 중입니다"}
            {collapsed && <span className="myinfo-summary">{oneLine(data, total.answered, all)}</span>}
          </span>
          <span className="myinfo-arrow">{collapsed ? "펼치기 ▼" : "접기 ▲"}</span>
        </button>
        {!collapsed && (
          <>
            <p className="muted">
              {all}개 항목 중 {total.answered}개 입력, {total.unknown}개 모름, {total.blank}개 비어 있음
              {total.unknown + total.blank > 0 && " · 모름·비어 있는 항목이 쓰이는 판정은 '확인 필요'로 표시됩니다."}
            </p>
            <ul className="step-list">
              {STEPS.map((s, i) => {
                const st = statFor(s.id, data);
                const n = st.answered + st.unknown + st.blank;
                return (
                  <li key={s.id}>
                    <span className="step-name">
                      {i + 1}. {s.title}
                    </span>
                    <span className="muted">
                      {st.answered}/{n} 입력{st.unknown > 0 ? ` · 모름 ${st.unknown}` : ""}
                    </span>
                    <button type="button" className="secondary" onClick={() => setWizard({ start: i })}>
                      {st.blank > 0 ? "입력" : "수정"}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="actions">
              {!completed && (
                <button type="button" onClick={() => setWizard({ start: data.step })}>
                  이어서 입력
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {error && <p className="banner error">{error}</p>}
      <MatchList data={data} feed={feed} onSelect={onSelect} region={selFromExtra(data.extra)} onRegionChange={saveRegion} />
    </div>
  );
}
