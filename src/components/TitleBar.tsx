// 직접 그린 제목표시줄: 우측 상단 "업데이트 | 최소화 | 최대화 | 닫기"
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { api, errorMessage } from "../api";

type UpdateState =
  | { kind: "idle" }
  | { kind: "available"; update: Update }
  | { kind: "busy"; label: string }
  | { kind: "message"; text: string };

const RECHECK_MS = 6 * 60 * 60 * 1000; // 6시간마다 새 버전 확인

export default function TitleBar() {
  const win = getCurrentWindow();
  const [version, setVersion] = useState("");
  const [maximized, setMaximized] = useState(false);
  const [state, setState] = useState<UpdateState>({ kind: "idle" });

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
    win.isMaximized().then(setMaximized).catch(() => {});
    const unlisten = win.onResized(() => win.isMaximized().then(setMaximized));

    // 조용히 확인만 하고, 새 버전이 있으면 버튼에 점 표시
    const quietCheck = () =>
      check()
        .then((u) => u && setState({ kind: "available", update: u }))
        .catch(() => {});
    quietCheck();
    const timer = window.setInterval(quietCheck, RECHECK_MS);
    return () => {
      window.clearInterval(timer);
      unlisten.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 버튼 한 번: 확인 → 다운로드 → 서명 검증 → 설치 → 재시작
  async function onUpdateClick() {
    if (state.kind === "busy") return;
    try {
      setState({ kind: "busy", label: "확인 중…" });
      const update = state.kind === "available" ? state.update : await check();
      if (!update) {
        setState({ kind: "message", text: `최신 버전입니다 (v${version})` });
        window.setTimeout(() => setState({ kind: "idle" }), 3000);
        return;
      }
      await api.prepareUpdate(); // 잠금 + 암호화된 파일 백업
      let total = 0;
      let received = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          received += event.data.chunkLength;
          const pct = total ? Math.floor((received / total) * 100) : 0;
          setState({ kind: "busy", label: `내려받는 중 ${pct}%` });
        }
        if (event.event === "Finished") setState({ kind: "busy", label: "설치 중…" });
      });
      await relaunch();
    } catch (e) {
      setState({ kind: "message", text: `업데이트 실패: ${errorMessage(e)}` });
      window.setTimeout(() => setState({ kind: "idle" }), 6000);
    }
  }

  const updateLabel =
    state.kind === "busy" ? state.label : state.kind === "message" ? state.text : "업데이트";

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-title" data-tauri-drag-region>
        청약 도우미 <span className="titlebar-version">v{version}</span>
      </div>
      <div className="titlebar-buttons">
        <button
          className={`tb-btn tb-update ${state.kind === "available" ? "has-update" : ""}`}
          onClick={onUpdateClick}
          title={state.kind === "available" ? `새 버전 v${state.update.version}` : "업데이트 확인"}
        >
          {updateLabel}
          {state.kind === "available" && <span className="update-dot" aria-label="새 버전 있음" />}
        </button>
        <button className="tb-btn" onClick={() => win.minimize()} title="최소화" aria-label="최소화">
          &#x2013;
        </button>
        <button
          className="tb-btn"
          onClick={() => win.toggleMaximize()}
          title={maximized ? "이전 크기로" : "최대화"}
          aria-label="최대화"
        >
          {maximized ? "❐" : "□"}
        </button>
        <button className="tb-btn tb-close" onClick={() => win.close()} title="닫기" aria-label="닫기">
          &#x2715;
        </button>
      </div>
    </header>
  );
}
