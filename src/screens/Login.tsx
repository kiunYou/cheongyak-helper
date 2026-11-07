import { useState, type FormEvent } from "react";
import { api, errorMessage, type ProfileSummary } from "../api";

type Props = {
  profiles: ProfileSummary[];
  onUnlocked: (profile: ProfileSummary) => void;
  onForgot: (profile: ProfileSummary) => void;
  onNewProfile: () => void;
};

export default function Login({ profiles, onUnlocked, onForgot, onNewProfile }: Props) {
  const [selectedId, setSelectedId] = useState(profiles[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = profiles.find((p) => p.id === selectedId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      onUnlocked(await api.unlock(selected.id, password));
    } catch (err) {
      setError(errorMessage(err));
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h1>잠금 해제</h1>
      {profiles.length > 1 && (
        <label>
          프로필
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {profiles.length === 1 && <p className="muted">{selected?.name}</p>}
      <label>
        비밀번호
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" disabled={busy || !password}>
          {busy ? "확인 중…" : "열기"}
        </button>
      </div>
      <div className="links">
        {selected && (
          <button type="button" className="link" onClick={() => onForgot(selected)}>
            비밀번호를 잊었어요
          </button>
        )}
        <button type="button" className="link" onClick={onNewProfile}>
          새 프로필 만들기
        </button>
      </div>
    </form>
  );
}
