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
