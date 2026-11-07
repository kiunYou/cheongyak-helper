// 메인 화면: 탭 4개 + 설정. 각 탭의 실제 기능은 2~5단계에서 채웁니다.
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type ProfileSummary, type Settings } from "../api";
import { FEED_REFRESH_MS } from "../config";
import { loadFeed, type Feed, type Notice } from "../notices";
import NoticeGuide from "../components/NoticeGuide";
import NoticeList from "../components/NoticeList";
import BackupPanel from "../components/profile/BackupPanel";
import MyInfo from "../components/profile/MyInfo";
import { buildReport, maybeSendWeeklyReport } from "../report";
import { normalize } from "../profile/types";

type Tab = "sh" | "lh" | "match" | "guide";

const TABS: { id: Tab; label: string }[] = [
  { id: "sh", label: "SH 공고" },
  { id: "lh", label: "LH 공고" },
  { id: "match", label: "나에게 맞는 공고" },
  { id: "guide", label: "청약 가이드" },
];

type Props = {
  profile: ProfileSummary;
  recoveryWarning: string | null;
  onLock: () => void;
  onSettingsChange: (s: Settings) => void;
};

export default function Main({ profile, recoveryWarning, onLock, onSettingsChange }: Props) {
  const [tab, setTab] = useState<Tab>("match");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");

  // 공고 피드(공개 정보): 시작할 때와 30분마다 가져옵니다.
  const [feed, setFeed] = useState<Feed | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [feedWarning, setFeedWarning] = useState("");
  const [feedSample, setFeedSample] = useState(false);
  const [selected, setSelected] = useState<Notice | null>(null);
  const [reportPreview, setReportPreview] = useState("");
  const [infoKey, setInfoKey] = useState(0); // 백업 복원 후 내 정보 화면을 다시 불러오기 위한 값

  const refreshFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const r = await loadFeed();
      setFeed(r.feed);
      setFeedSample(r.from === "sample");
      setFeedWarning(r.warning ?? "");
      setFeedError("");
    } catch (e) {
      setFeedError(errorMessage(e));
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshFeed();
    const t = window.setInterval(refreshFeed, FEED_REFRESH_MS);
    return () => window.clearInterval(t);
  }, [refreshFeed]);

  function selectNotice(n: Notice) {
    setSelected(n);
    setTab("guide");
  }

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s);
        onSettingsChange(s);
      })
      .catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 주간 익명 통계: 켜져 있으면 주 1회만 전송합니다(항목 이름·상태만, 값은 없음).
  useEffect(() => {
    if (!settings || !settings.weeklyReport) return;
    api
      .loadPersonalData()
      .then((raw) => maybeSendWeeklyReport(normalize(raw), true))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.weeklyReport]);

  async function showReportPreview() {
    if (reportPreview) {
      setReportPreview("");
      return;
    }
    try {
      const raw = await api.loadPersonalData();
      setReportPreview(JSON.stringify(buildReport(normalize(raw)), null, 2));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function updateSettings(next: Settings) {
    setSettings(next);
    onSettingsChange(next);
    try {
      await api.setSettings(next);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="main">
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        <div className="tabs-right">
          <span className="muted">{profile.name}</span>
          <button className="tab" onClick={() => setShowSettings((v) => !v)}>
            설정
          </button>
        </div>
      </nav>

      {recoveryWarning && (
        <p className="banner warn">
          이 PC에서는 관리자 승인 복구를 설정하지 못했습니다. 비밀번호를 잊으면 복구할 수 없습니다. ({recoveryWarning})
        </p>
      )}
      {error && <p className="banner error">{error}</p>}

      {showSettings && settings && (
        <section className="settings">
          <label className="check">
            <input
              type="checkbox"
              checked={settings.weeklyReport}
              onChange={(e) => updateSettings({ ...settings, weeklyReport: e.target.checked })}
            />
            주간 익명 통계 자동 전송 (항목 이름과 횟수만, 개인정보 값 없음)
          </label>
          <label>
            자동 잠금 (분)
            <input
              type="number"
              min={1}
              max={120}
              value={settings.autoLockMinutes}
              onChange={(e) => updateSettings({ ...settings, autoLockMinutes: Number(e.target.value) || 10 })}
            />
          </label>
          <button className="secondary" onClick={showReportPreview}>
            {reportPreview ? "보낼 내용 닫기" : "이번 주 보낼 내용 미리보기"}
          </button>
          <button className="secondary" onClick={onLock}>
            지금 잠그기
          </button>
          {reportPreview && <pre className="report-preview">{reportPreview}</pre>}
        </section>
      )}
      {showSettings && (
        <section className="settings-backup">
          <BackupPanel onRestored={() => setInfoKey((k) => k + 1)} />
        </section>
      )}

      <section className="tab-body">
        {(tab === "sh" || tab === "lh") && (
          <NoticeList
            agency={tab === "sh" ? "SH" : "LH"}
            feed={feed}
            loading={feedLoading}
            error={feedError}
            warning={feedWarning}
            sample={feedSample}
            onRefresh={refreshFeed}
            onSelect={selectNotice}
          />
        )}
        {tab === "match" && <MyInfo key={infoKey} feed={feed} onSelect={selectNotice} />}
        {tab === "guide" && <NoticeGuide notice={selected} />}
      </section>
    </div>
  );
}
