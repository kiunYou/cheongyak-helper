// SH/LH 공고 목록: 종류 필터, 모집중만 보기, 검색, 클릭하면 청약 가이드로 이동
import { useMemo, useState } from "react";
import { dateLabel, type Feed, type Notice } from "../notices";

type Props = {
  agency: "SH" | "LH";
  feed: Feed | null;
  loading: boolean;
  error: string;
  warning: string;
  sample: boolean;
  onRefresh: () => void;
  onSelect: (n: Notice) => void;
};

type Kind = "전체" | "분양" | "임대";

export default function NoticeList({ agency, feed, loading, error, warning, sample, onRefresh, onSelect }: Props) {
  const [kind, setKind] = useState<Kind>("전체");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [query, setQuery] = useState("");

  const all = useMemo(() => (feed ? feed.notices.filter((n) => n.agency === agency) : []), [feed, agency]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (n) =>
        (kind === "전체" || n.kind === kind) &&
        (!onlyOpen || n.open) &&
        (!q || `${n.title} ${n.type} ${n.region}`.toLowerCase().includes(q)),
    );
  }, [all, kind, onlyOpen, query]);

  const src = feed?.sources[agency];

  return (
    <div className="notice-list">
      <div className="notice-toolbar">
        <div className="chips">
          {(["전체", "분양", "임대"] as Kind[]).map((k) => (
            <button key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>
              {k}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          모집중만
        </label>
        <input
          className="search"
          placeholder="공고명·유형·지역 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="secondary" onClick={onRefresh} disabled={loading}>
          {loading ? "가져오는 중…" : "새로고침"}
        </button>
      </div>

      {sample && (
        <p className="banner warn">
          샘플 데이터입니다. src/config.ts의 FEED_URL을 실제 주소로 바꾸면 실제 공고가 표시됩니다.
        </p>
      )}
      {warning && <p className="banner warn">{warning}</p>}
      {error && <p className="banner error">{error}</p>}
      {src && !src.ok && (
        <p className="banner warn">
          {agency} 공고 수집에 문제가 있어 이전 목록을 보여주고 있습니다. ({src.error})
        </p>
      )}

      <p className="muted small">
        {feed ? `${agency} ${all.length}건 중 ${shown.length}건 표시 · 피드 갱신 ${feed.generated.replace("T", " ").slice(0, 16)}` : ""}
      </p>

      {shown.length === 0 && !loading ? (
        <div className="placeholder">조건에 맞는 공고가 없습니다.</div>
      ) : (
        <ul className="notices">
          {shown.map((n) => (
            <li key={n.id}>
              <button className="notice-item" onClick={() => onSelect(n)}>
                <span className="notice-top">
                  <span className={`badge ${n.kind === "분양" ? "sale" : "lease"}`}>{n.kind}</span>
                  {n.type && <span className="badge type">{n.type}</span>}
                  <span className={`badge ${n.open ? "open" : "closed"}`}>{n.status || (n.open ? "모집중" : "마감")}</span>
                </span>
                <span className="notice-title">{n.title}</span>
                <span className="notice-meta">
                  {[n.region, n.posted && `게시 ${n.posted}`, dateLabel(n)].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
