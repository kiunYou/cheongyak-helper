// 청약 가이드 탭: 공고 기본 정보 + 신청 가능 유형과 근거 + 추가 확인 사항 + 준비 서류 + 전화 문의 질문.
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { evaluateNotice } from "../engine/evaluate";
import { buildGuide } from "../engine/guide";
import { dateLabel, type Notice } from "../notices";
import { normalize, type PersonalData } from "../profile/types";

const MARK = { ok: "✔", fail: "✖", unknown: "?", info: "ⓘ" } as const;

export default function NoticeGuide({ notice }: { notice: Notice | null }) {
  const [err, setErr] = useState("");
  const [data, setData] = useState<PersonalData | null>(null);
  const [dataErr, setDataErr] = useState("");

  useEffect(() => {
    api
      .loadPersonalData()
      .then((raw) => setData(normalize(raw)))
      .catch((e) => setDataErr(e instanceof Error ? e.message : String(e)));
  }, [notice?.id]);

  const result = useMemo(() => (notice && data ? evaluateNotice(data, notice) : null), [notice, data]);
  const guide = useMemo(() => (result && result.modeled ? buildGuide(result) : null), [result]);

  if (!notice) {
    return (
      <div className="placeholder">
        SH 공고·LH 공고(또는 '나에게 맞는 공고')에서 공고를 클릭하면 여기에 가이드가 열립니다.
      </div>
    );
  }

  async function openOriginal() {
    setErr("");
    try {
      await openUrl(notice!.url);
    } catch (e) {
      setErr(`원문을 열지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="guide">
      <h2>{notice.title}</h2>
      <p className="notice-top">
        <span className="badge type">{notice.agency}</span>
        <span className={`badge ${notice.kind === "분양" ? "sale" : "lease"}`}>{notice.kind}</span>
        {notice.type && <span className="badge type">{notice.type}</span>}
        <span className={`badge ${notice.open ? "open" : "closed"}`}>{notice.status}</span>
      </p>
      <dl className="facts">
        <dt>지역</dt>
        <dd>{notice.region || "-"}</dd>
        <dt>게시일</dt>
        <dd>{notice.posted || "-"}</dd>
        {dateLabel(notice) && (
          <>
            <dt>일정</dt>
            <dd>{dateLabel(notice)}</dd>
          </>
        )}
        {notice.dept && (
          <>
            <dt>담당 부서</dt>
            <dd>{notice.dept}</dd>
          </>
        )}
      </dl>
      {notice.url ? (
        <button onClick={openOriginal}>공고 원문 열기</button>
      ) : (
        <p className="muted">이 공고는 원문 주소가 제공되지 않았습니다. 해당 기관 홈페이지에서 공고명을 검색하세요.</p>
      )}
      {err && <p className="banner error">{err}</p>}
      {dataErr && <p className="banner error">내 정보를 불러오지 못했습니다: {dataErr}</p>}
      {result && !result.modeled && <p className="banner info">{result.reason}</p>}
      {result && result.refAssumed && <p className="muted small">공고 게시일이 없어 오늘 날짜를 기준일로 썼습니다.</p>}
      {guide && result && (
        <>
          <p className="muted small">
            기준일 {result.refDate} · 참고용 판정입니다. 공고문의 자격·서류 안내가 최종입니다.
          </p>
          <section className="g-sec">
            <h3>내가 신청할 수 있는 유형과 근거</h3>
            {guide.summary.map((t) => (
              <details key={t.name} className="g-type" open={t.verdict !== "불가"}>
                <summary>
                  <span className={`pill ${t.verdict === "가능" ? "yes" : t.verdict === "확인 필요" ? "maybe" : "no"}`}>{t.verdict}</span> {t.name}
                </summary>
                <ul className="g-checks">
                  {t.checks.map((c, i) => (
                    <li key={i} className={`c-${c.status}`}>
                      <span className="c-mark">{MARK[c.status]}</span>
                      <span>
                        <b>{c.label}</b> — {c.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </section>
          {guide.openItems.length > 0 && (
            <section className="g-sec">
              <h3>추가로 확인할 항목</h3>
              <ul className="g-list">
                {guide.openItems.map((o, i) => (
                  <li key={i}>
                    <b>[{o.type}] {o.check.label}</b> — {o.check.detail}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {guide.checkInNotice.length > 0 && (
            <section className="g-sec">
              <h3>공고문에서 직접 확인할 것</h3>
              <ul className="g-list">{guide.checkInNotice.map((x) => <li key={x}>{x}</li>)}</ul>
            </section>
          )}
          <section className="g-sec">
            <h3>준비해 둘 서류</h3>
            <ul className="g-list">{guide.documents.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
          {guide.questions.length > 0 && (
            <section className="g-sec">
              <h3>전화 문의 때 물어볼 질문{notice.dept ? ` (담당: ${notice.dept})` : ""}</h3>
              <ol className="g-list">{guide.questions.map((x) => <li key={x}>{x}</li>)}</ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}
