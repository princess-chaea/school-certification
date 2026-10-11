import { useState } from "react";
import { login, type LoginIntent } from "../lib/auth";
import { PixelIcon, PixelMedal } from "../components/Pixel";

/** 모든 학교 공통 첫 화면 */
export function Login() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(intent: LoginIntent) {
    setBusy(true);
    setErr(null);
    try {
      await login(intent);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") setErr("로그인하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <button className="signup-corner" onClick={() => go("teacher")} disabled={busy}><PixelIcon name="users" size={18} /> 회원가입(교사)</button>
      <div className="card stack" style={{ alignItems: "center" }}>
        <div className="login-mark" aria-hidden="true"><PixelMedal medal="gold" size={64} /></div>
        <h1 style={{ margin: "6px 0 0", fontSize: "2.1rem" }}>학교장 인증제</h1>
        <div className="muted">도전! 꿈 성취</div>
        <div className="small muted" style={{ margin: "8px 0 4px", lineHeight: 1.6 }}>
          스스로 도전하고, 기록하고, 성장을 눈으로 확인해요.
        </div>
        <button className="gbtn" disabled={busy} onClick={() => go("student")}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Google 계정으로 로그인
        </button>
        <div className="tiny" style={{ lineHeight: 1.6 }}>
          학생·선생님 모두 이 버튼으로 로그인하면 우리 학교 페이지로 바로 들어가요.
          <br />
          처음 오신 선생님은 오른쪽 위 [회원가입(교사)]에서 학교와 역할(관리자·담임·전담)을 골라요.
        </div>
        {err && <div className="chip red">{err}</div>}
      </div>
    </div>
  );
}
