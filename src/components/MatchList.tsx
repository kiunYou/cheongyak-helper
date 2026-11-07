// "나에게 맞는 공고": 내 정보와 공고를 비교해 특별공급·일반공급별 신청 가능 여부(참고용)를 보여줍니다.
import { useMemo, useState } from "react";
import { evaluateNotice, summarize, RULES, type TypeResult, type Verdict } from "../engine/evaluate";
import type { Feed, Notice } from "../notices";
import type { PersonalData } from "../profile/types";

type Filter = "전체" | "가능" | "확인 필요";

const cls = (v: Verdict) => (v === "가능" ? "yes" : v === "확인 필요" ? "maybe" : "no");

function Pill({ t }: { t: TypeResult }) {
  return <span className={`pill ${cls(t.verdict)}`}>{t.name.replace(/ 특별공급$/, "")} · {t.verdict}</span>;
}

export default function MatchList({ data, feed, onSelect }: { data: PersonalData; feed: Feed | null; onSelect: (n: Notice) => void }) {
  const [filter, setFilter] = useState<Filter>("전체");
  const [openOnly, setOpenOnly] = useState(true);

  const rows = useMemo(() => {
    if (!feed) return [];
    return feed.notices
      .filter((n) => (openOnly ? n.open : true))
      .map((n) => {
        const r = evaluateNotice(data, n);
        return { n, r, s: summarize(r) };
      });
  }, [feed, data, openOnly]);

  if (!feed) return <p className="muted">공고를 불러오는 중…</p>;

  const modeled = rows.filter((x) => x.r.modeled);
  const skipped = rows.length - modeled.length;
  const order = { 가능: 0, "확인 필요": 1, 불가: 2 } as const;
  const shown = modeled
    .filter((x) => filter === "전체" || x.s.best === filter)
    .sort((a, b) => order[a.s.best ?? "불가"] - order[b.s.best ?? "불가"]);

  return (
    <div className="match">
      <h2>신청 가능한 공고 (참고용)</h2>
      <p className="muted small">
        내 정보와 공고 게시일 기준으로 비교한 결과입니다. 기준 숫자는 {RULES.asOf} 기준이고, 공고별 물량·지역·주택형 조건은 반영되지 않았으므로 최종 판단은 반드시 공고문으로 하세요. 모름·비어 있는 항목이 쓰이는 유형은 '확인 필요'로 표시됩니다.
      </p>
      <div className="notice-toolbar">
        <div className="chips">
          {(["전체", "가능", "확인 필요"] as Filter[]).map((f) => (
            <button key={f} type="button" className={`chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          모집중만
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="placeholder">조건에 맞는 공고가 없습니다.{skipped > 0 && ` (판정하지 않는 공고 ${skipped}건 제외)`}</p>
      ) : (
        <ul className="notices">
          {shown.map(({ n, r }) => {
            const special = r.specials.filter((t) => t.verdict !== "불가");
            const rentals = r.rentals.filter((t) => t.verdict !== "불가");
            return (
              <li key={n.id}>
                <button type="button" className="notice-item" onClick={() => onSelect(n)}>
                  <span className="notice-top">
                    <span className="badge type">{n.agency}</span>
                    {n.type && <span className="badge type">{n.type}</span>}
                    <span className={`badge ${n.open ? "open" : "closed"}`}>{n.status}</span>
                  </span>
                  <span className="notice-title">{n.title}</span>
                  <span className="notice-meta">{n.region || "지역 미상"} · 게시 {n.posted || "-"}</span>
                  {r.category === "임대" ? (
                    <span className="match-row">
                      <span className="match-label">임대</span>
                      {rentals.length ? rentals.map((t) => <Pill key={t.id} t={t} />) : <span className="muted">해당 계층 없음</span>}
                    </span>
                  ) : (
                    <>
                      <span className="match-row">
                        <span className="match-label">특별공급</span>
                        {special.length ? special.map((t) => <Pill key={t.id} t={t} />) : <span className="muted">해당 유형 없음</span>}
                      </span>
                      <span className="match-row">
                        <span className="match-label">일반공급</span>
                        {r.general ? <Pill t={r.general} /> : <span className="muted">-</span>}
                      </span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {skipped > 0 && shown.length > 0 && <p className="muted small">장기전세·민영·신혼희망타운 등 아직 판정하지 않는 공고 {skipped}건은 SH·LH 탭에서 확인하세요.</p>}
    </div>
  );
}
