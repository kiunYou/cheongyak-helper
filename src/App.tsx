import { useCallback, useEffect, useRef, useState } from "react";
import TitleBar from "./components/TitleBar";
import Signup from "./screens/Signup";
import Login from "./screens/Login";
import Recovery from "./screens/Recovery";
import Main from "./screens/Main";
import { api, errorMessage, type ProfileSummary, type Settings } from "./api";

type View =
  | { kind: "loading" }
  | { kind: "signup" }
  | { kind: "login" }
  | { kind: "recovery"; profile: ProfileSummary }
  | { kind: "main"; profile: ProfileSummary; recoveryWarning: string | null };

export default function App() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [error, setError] = useState("");
  const autoLockMinutes = useRef(10);

  const refresh = useCallback(async () => {
    try {
      const list = await api.listProfiles();
      setProfiles(list);
      const current = await api.currentProfile();
      if (current) setView({ kind: "main", profile: current, recoveryWarning: null });
      else setView(list.length ? { kind: "login" } : { kind: "signup" });
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const lockNow = useCallback(async () => {
    await api.lock().catch(() => {});
    setView({ kind: "login" });
  }, []);

  // 미사용 자동 잠금
  useEffect(() => {
    if (view.kind !== "main") return;
    let timer = 0;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lockNow, autoLockMinutes.current * 60 * 1000);
    };
    const events = ["mousemove", "keydown", "mousedown", "wheel"];
    events.forEach((ev) => window.addEventListener(ev, reset));
    reset();
    return () => {
      window.clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [view.kind, lockNow]);

  async function afterUnlock(profile: ProfileSummary, recoveryWarning: string | null = null) {
    setProfiles(await api.listProfiles());
    setView({ kind: "main", profile, recoveryWarning });
  }

  return (
    <div className="app">
      <TitleBar />
      <div className="content">
        {error && <p className="banner error">{error}</p>}
        {view.kind === "loading" && <p className="muted center">불러오는 중…</p>}
        {view.kind === "signup" && (
          <Signup
            canCancel={profiles.length > 0}
            onCancel={() => setView({ kind: "login" })}
            onCreated={(p, warning) => afterUnlock(p, warning)}
          />
        )}
        {view.kind === "login" && (
          <Login
            profiles={profiles}
            onUnlocked={(p) => afterUnlock(p)}
            onForgot={(p) => setView({ kind: "recovery", profile: p })}
            onNewProfile={() => setView({ kind: "signup" })}
          />
        )}
        {view.kind === "recovery" && (
          <Recovery
            profile={view.profile}
            onRecovered={(p) => afterUnlock(p)}
            onBack={() => setView({ kind: "login" })}
          />
        )}
        {view.kind === "main" && (
          <Main
            profile={view.profile}
            recoveryWarning={view.recoveryWarning}
            onLock={lockNow}
            onSettingsChange={(s: Settings) => (autoLockMinutes.current = s.autoLockMinutes)}
          />
        )}
      </div>
    </div>
  );
}
