import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PixelIcon } from "./Pixel";
import { logout } from "../lib/auth";

/** 공통 팝업 */
// document.body 에 그림: 움직이는 카드(transform) 안에 두면 fixed 위치가 카드 기준으로 바뀌어 팝업이 흔들림
export function Modal({ title, icon, onClose, children, wide }: { title: string; icon: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose} style={{ alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card px-card dialog" role="dialog" aria-modal="true" aria-label={title} style={{ width: wide ? "min(760px, 100%)" : "min(440px, 100%)", maxHeight: "86dvh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="page-head">
          <PixelIcon name={icon} size={28} />
          <h1 style={{ fontSize: "1.3rem" }}>{title}</h1>
          <div className="page-head-right"><button className="btn ghost sm" onClick={onClose} aria-label="닫기">✕</button></div>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** 로그아웃 버튼: 한 번 확인한 뒤 로그아웃 */
export function LogoutButton({ className = "btn ghost sm", label = "로그아웃" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)} aria-label="로그아웃">{label}</button>
      {open && (
        <Modal title="로그아웃" icon="hand" onClose={() => setOpen(false)}>
          <p style={{ margin: 0 }}>로그아웃할까요?</p>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn ghost" onClick={() => setOpen(false)}>취소</button>
            <button className="btn" autoFocus onClick={() => logout()}>로그아웃</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ── 시스템 팝업(confirm/prompt) 대신 쓰는 인증제 테마 팝업 ─────────────────
type Dialog =
  | { kind: "confirm"; title: string; message: string; ok: string; danger?: boolean; notice?: boolean; icon: string; resolve: (v: boolean) => void }
  | { kind: "text"; title: string; label: string; initial: string; ok: string; placeholder?: string; maxLength?: number; icon: string; resolve: (v: string | null) => void };
let showDialog: ((d: Dialog | null) => void) | null = null;

/** 확인 팝업: 확인 → true, 취소·닫기 → false (notice: 확인 버튼만 있는 안내) */
export function askConfirm(o: { title: string; message: string; ok?: string; danger?: boolean; notice?: boolean; icon?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    if (!showDialog) return resolve(false);
    showDialog({ kind: "confirm", ok: "확인", icon: o.danger ? "alert" : "check", ...o, resolve });
  });
}
/** 안내 팝업 (확인 버튼 하나) */
export function notice(title: string, message: string, icon = "alert"): Promise<boolean> {
  return askConfirm({ title, message, notice: true, icon });
}
/** 입력 팝업: 확인 → 입력값(앞뒤 공백 제거), 취소·닫기 → null */
export function askText(o: { title: string; label: string; initial?: string; ok?: string; placeholder?: string; maxLength?: number; icon?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    if (!showDialog) return resolve(null);
    showDialog({ kind: "text", ok: "저장", initial: "", icon: "pen", ...o, resolve });
  });
}

/** App 에 한 번 놓아 두는 팝업 자리 */
export function DialogHost() {
  const [d, setD] = useState<Dialog | null>(null);
  const [text, setText] = useState("");
  showDialog = (next) => {
    setText(next?.kind === "text" ? next.initial : "");
    setD(next);
  };
  if (!d) return null;
  const close = (v: boolean | string | null) => {
    if (d.kind === "confirm") d.resolve(v === true);
    else d.resolve(typeof v === "string" ? v : null);
    setD(null);
  };
  return (
    <Modal title={d.title} icon={d.icon} onClose={() => close(d.kind === "confirm" ? false : null)}>
      {d.kind === "confirm" ? (
        <p style={{ margin: 0, whiteSpace: "pre-line", lineHeight: 1.7 }}>{d.message}</p>
      ) : (
        <label className="field">
          <span>{d.label}</span>
          <input className="input" autoFocus value={text} maxLength={d.maxLength} placeholder={d.placeholder}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && text.trim() && close(text.trim())} />
        </label>
      )}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
        {!(d.kind === "confirm" && d.notice) && <button className="btn ghost" onClick={() => close(d.kind === "confirm" ? false : null)}>취소</button>}
        <button className={`btn ${d.kind === "confirm" && d.danger ? "danger" : ""}`} autoFocus={d.kind === "confirm"} disabled={d.kind === "text" && !text.trim()}
          onClick={() => close(d.kind === "confirm" ? true : text.trim())}>{d.ok}</button>
      </div>
    </Modal>
  );
}
