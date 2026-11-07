// 암호화 백업 만들기/복원. 백업 파일은 로그인 비밀번호와 별개의 "백업 비밀번호"로 암호화됩니다.
import { useState } from "react";
import { api, errorMessage } from "../../api";
import { normalize } from "../../profile/types";

type Mode = null | "export" | "import";

export default function BackupPanel({ onRestored }: { onRestored: () => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [text, setText] = useState("");
  const [exported, setExported] = useState("");
  const [confirmReplace, setConfirmReplace] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function reset(next: Mode) {
    setMode(next);
    setPw("");
    setPw2("");
    setText("");
    setExported("");
    setConfirmReplace(null);
    setMsg("");
    setError("");
  }

  async function doExport() {
    setError("");
    if (pw.length < 8) return setError("백업 비밀번호는 8자 이상이어야 합니다.");
    if (pw !== pw2) return setError("백업 비밀번호가 서로 다릅니다.");
    setBusy(true);
    try {
      const out = await api.exportBackup(pw);
      setExported(out);
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      const url = URL.createObjectURL(new Blob([out], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `청약도우미-백업-${stamp}.cyb`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMsg("백업 파일을 만들었습니다. 저장 창이 뜨지 않으면 아래 '내용 복사'를 눌러 메모장에 붙여넣고 .cyb 파일로 저장하세요. 백업 비밀번호를 잊으면 복원할 수 없습니다.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function readFile(file: File | null | undefined) {
    if (!file) return;
    try {
      setText(await file.text());
      setError("");
    } catch {
      setError("파일을 읽지 못했습니다.");
    }
  }

  async function doImport() {
    setError("");
    if (!text.trim()) return setError("백업 파일을 선택하거나 내용을 붙여넣으세요.");
    if (!pw) return setError("백업 비밀번호를 입력하세요.");
    setBusy(true);
    try {
      setConfirmReplace(await api.importBackup(text.trim(), pw));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function doReplace() {
    if (!confirmReplace) return;
    setBusy(true);
    try {
      await api.savePersonalData(normalize(confirmReplace) as unknown as Record<string, unknown>);
      reset(null);
      setMsg("백업에서 복원했습니다.");
      onRestored();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="backup">
      <div className="backup-buttons">
        <strong>내 정보 백업</strong>
        <button type="button" className="secondary" onClick={() => reset(mode === "export" ? null : "export")}>
          백업 파일 만들기
        </button>
        <button type="button" className="secondary" onClick={() => reset(mode === "import" ? null : "import")}>
          백업에서 복원
        </button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      {error && <p className="error">{error}</p>}

      {mode === "export" && (
        <div className="backup-form">
          <p className="muted small">PC를 바꾸거나 Windows를 다시 설치할 때 쓰는 파일입니다. 로그인 비밀번호와 다른 백업 비밀번호로 암호화됩니다.</p>
          <input type="password" placeholder="백업 비밀번호 (8자 이상)" value={pw} onChange={(e) => setPw(e.target.value)} />
          <input type="password" placeholder="백업 비밀번호 확인" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          <div className="actions">
            <button type="button" disabled={busy} onClick={doExport}>
              {busy ? "만드는 중…" : "만들기"}
            </button>
            {exported && (
              <button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(exported).then(() => setMsg("내용을 복사했습니다."))}>
                내용 복사
              </button>
            )}
          </div>
        </div>
      )}

      {mode === "import" && (
        <div className="backup-form">
          {confirmReplace ? (
            <>
              <p>지금 이 PC에 입력된 내 정보가 백업 내용으로 바뀝니다. 계속할까요?</p>
              <div className="actions">
                <button type="button" className="secondary" onClick={() => setConfirmReplace(null)}>
                  취소
                </button>
                <button type="button" disabled={busy} onClick={doReplace}>
                  바꾸기
                </button>
              </div>
            </>
          ) : (
            <>
              <input type="file" accept=".cyb,.json,.txt" onChange={(e) => readFile(e.target.files?.[0])} />
              <details>
                <summary className="muted small">파일 대신 내용을 붙여넣기</summary>
                <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
              </details>
              <input type="password" placeholder="백업 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} />
              <div className="actions">
                <button type="button" disabled={busy} onClick={doImport}>
                  {busy ? "여는 중…" : "백업 열기"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
