import { useState, type FormEvent } from "react";
import { api, errorMessage, type ProfileSummary } from "../api";

type Props = {
  canCancel: boolean;
  onCancel: () => void;
  onCreated: (profile: ProfileSummary, recoveryWarning: string | null) => void;
};

export default function Signup({ canCancel, onCancel, onCreated }: Props) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("비밀번호 확인이 일치하지 않습니다.");
    setBusy(true);
    try {
      const result = await api.createProfile(name, password, ack);
      onCreated(result.profile, result.recoveryWarning);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h1>프로필 만들기</h1>

      <section className="notice">
        <h2>시작하기 전에 확인해 주세요</h2>
        <ul>
          <li>
            입력한 개인정보는 <strong>이 PC에만 암호화되어 저장</strong>되고 외부로 전송되지 않습니다.
            개발자도 볼 수 없습니다.
          </li>
          <li>
            비밀번호를 잊으면 관리자에게 복구를 요청할 수 있습니다. 복구는 <strong>이 PC에서만</strong>{" "}
            가능하며, 관리자 혼자서는 개인정보를 열 수 없습니다.
          </li>
          <li>
            입력란 개선을 위해 <strong>매주 익명 통계</strong>(판단에 필요했지만 비어 있던 항목의 이름과
            횟수)가 자동 전송됩니다. 개인정보 값은 포함되지 않으며 설정에서 끌 수 있습니다.
          </li>
          <li>
            이 프로그램의 자격 판단은 <strong>참고용</strong>입니다. 최종 확인은 공고문과 SH·LH 문의로
            하세요. SH·LH의 공식 프로그램이 아닙니다.
          </li>
        </ul>
        <label className="check">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          위 내용을 확인했습니다
        </label>
      </section>

      <label>
        프로필 이름
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoFocus />
      </label>
      <label>
        비밀번호 (8자 이상)
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label>
        비밀번호 확인
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="actions">
        {canCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            취소
          </button>
        )}
        <button type="submit" disabled={busy || !ack}>
          {busy ? "만드는 중…" : "만들기"}
        </button>
      </div>
    </form>
  );
}
