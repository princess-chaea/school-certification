import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { logout } from "../lib/auth";
import { IS_EMULATOR } from "../firebase";

export function Layout({ who, tabs, children }: { who: string; tabs: Array<{ to: string; label: string; end?: boolean }>; children: ReactNode }) {
  return (
    <>
      <header className="app-header">
        <img src="/logo.png" alt="하주초 교표" />
        <div className="title">
          하주 학교장 인증제
          <small>도전! 꿈 성취 {IS_EMULATOR ? "· 테스트 모드" : ""}</small>
        </div>
        <div className="spacer" />
        <div className="who">{who}</div>
        <button onClick={() => logout()}>로그아웃</button>
      </header>
      {tabs.length > 1 && (
        <nav className="nav-tabs">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? "active" : "")}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      )}
      {children}
    </>
  );
}
