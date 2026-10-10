import { NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { logout } from "../lib/auth";
import { IS_EMULATOR } from "../firebase";
import { useSchool } from "../lib/school";

export interface Tab {
  to: string;
  icon: string;
  label: string;
  end?: boolean;
}

/** 상단 헤더 + 탭 (태블릿: 상단 탭 / 폰: 하단 탭 바) */
export function Layout({ who, tabs, children, extra }: { who: string; tabs: Tab[]; children: ReactNode; extra?: ReactNode }) {
  const school = useSchool();
  return (
    <div className={tabs.length > 1 ? "has-tabs" : ""}>
      <header className="app-header">
        {school.logoUrl ? <img src={school.logoUrl} alt={`${school.name} 교표`} /> : <span className="logo-fallback" aria-hidden="true">🏫</span>}
        <div className="title">
          {school.shortName} 학교장 인증제
          <small>도전! 꿈 성취{IS_EMULATOR ? " · 테스트 모드" : ""}</small>
        </div>
        <div className="spacer" />
        <div className="who">{who}</div>
        {extra}
        <button onClick={() => logout()} aria-label="로그아웃">로그아웃</button>
      </header>
      {tabs.length > 1 && (
        <nav className="nav-tabs" aria-label="주 메뉴">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? "active" : "")}>
              <span className="ico" aria-hidden="true">{t.icon}</span>
              <span className="lbl">{t.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
      <main>{children}</main>
    </div>
  );
}

/** 탭 안쪽 화면용 제목 줄: ← 뒤로 + 제목 + 오른쪽 도구 */
export function PageHeader({ title, back, right }: { title: ReactNode; back?: string; right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="page-head">
      {back && (
        <button className="back-btn" onClick={() => nav(back)} aria-label="뒤로">
          ←
        </button>
      )}
      <h1>{title}</h1>
      {right && <div className="page-head-right">{right}</div>}
    </div>
  );
}
