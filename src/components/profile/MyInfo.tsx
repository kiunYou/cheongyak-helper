// "나에게 맞는 공고" 탭: 내 정보 입력 상태 요약과 수정 진입, 그 아래에 공고별 판정.
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api";
import { STEPS, statFor, totalStat } from "../../profile/schema";
import { normalize, type PersonalData } from "../../profile/types";
import type { Feed, Notice } from "../../notices";
import MatchList from "../MatchList";
import Wizard from "./Wizard";

export default function MyInfo({ feed, onSelect }: { feed: Feed | null; onSelect: (n: Notice) => void }) {
  const [data, setData] = useState<PersonalData | null>(null);
  const [error, setError] = useState("");
  const [wizard, setWizard] = useState<{ start: number } | null>(null);

  useEffect(() => {
    api
      .loadPersonalData()
      .then((raw) => setData(normalize(raw)))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <p className="banner error">{error}</p>;
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
      <div className="card wide">
        <h1>{completed ? "내 정보 입력 현황" : "입력 중입니다"}</h1>
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
      </div>
      <MatchList data={data} feed={feed} onSelect={onSelect} />
    </div>
  );
}
