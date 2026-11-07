// 관리자 승인 복구: 요청 코드를 관리자에게 보내고, 받은 복구 코드로 새 비밀번호 설정
import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage, type ProfileSummary } from "../api";

type Props = {
  profile: ProfileSummary;
  onRecovered: (profile: ProfileSummary) => void;
  onBack: () => void;
};

export default function Recovery({ profile, onRecovered, onBack }: Props) {
  const [requestCode, setRequestCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.recoveryRequest(profile.id).then(setRequestCode).catch((e) => setError(errorMessage(e)));
  }, [profile.id]);

  async function copy() {
    await navigator.clipboard.writeText(requestCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("비밀번호 확인이 일치하지 않습니다.");
    setBusy(true);
    try {
      onRecovered(await api.recoveryApply(profile.id, code, password));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h1>비밀번호 복구</h1>
      <p className="muted">
        관리자 승인과 이 PC가 모두 있어야 복구됩니다. 관리자는 이 코드로 개인정보를 볼 수 없습니다.
      </p>

      {!profile.recoveryEnabled ? (
        <p className="error">
          이 프로필은 가입할 때 복구 설정이 되지 않았습니다. 새 프로필을 만들어 다시 입력해야 합니다.
        </p>
      ) : (
        <>
          <h2>1. 복구 요청 코드를 관리자에게 보내기</h2>
          <textarea className="code" readOnly value={requestCode} rows={4} />
          <button type="button" className="secondary" onClick={copy} disabled={!requestCode}>
            {copied ? "복사했습니다" : "코드 복사"}
          </button>

          <h2>2. 관리자에게 받은 복구 코드 입력</h2>
          <input className="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="REC1.…" />
          <label>
            새 비밀번호 (8자 이상)
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>
            새 비밀번호 확인
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
        </>
      )}

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="secondary" onClick={onBack}>
          돌아가기
        </button>
        {profile.recoveryEnabled && (
          <button type="submit" disabled={busy || !code || !password}>
            {busy ? "복구 중…" : "복구하기"}
          </button>
        )}
      </div>
    </form>
  );
}
