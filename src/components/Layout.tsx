import { sloganOf } from "../../shared/school";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { LogoutButton } from "./Modal";
import { IS_EMULATOR } from "../firebase";
import { useSchool } from "../lib/school";
import { PixelIcon } from "./Pixel";
import { holdNavigation } from "../lib/navGuard";

export interface Tab {
  to: string;
  icon: string;
  label: string;
  end?: boolean;
}

const PHONE_MAX = 5;

/** 모든 학교 공통 화면 틀: 상단 헤더 + 탭 (태블릿·PC: 상단 탭 / 폰: 하단 탭 바, 5개 넘으면 더보기) */
export function Layout({ who, tabs, children, extra }: { who: string; tabs: Tab[]; children: ReactNode; extra?: ReactNode }) {
  const school = useSchool();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const go = useNavigate();
  // 편집 중(저장 안 함)이면 이동 전에 확인 팝업
  const guardClick = (to: string) => (e: React.MouseEvent) => {
    if (holdNavigation(() => go(to))) e.preventDefault();
  };
  const phoneTabs = tabs.length > PHONE_MAX ? tabs.slice(0, PHONE_MAX - 1) : tabs;
  const moreTabs = tabs.length > PHONE_MAX ? tabs.slice(PHONE_MAX - 1) : [];
  const moreActive = moreTabs.some((t) => (t.end ? loc.pathname === t.to : loc.pathname.startsWith(t.to)));
  return (
    <div className={tabs.length > 1 ? "has-tabs" : ""}>
      <header className="app-header">
        {school.logoUrl ? <img src={school.logoUrl} alt={`${school.name} 교표`} /> : <span className="logo-fallback"><PixelIcon name="school" size={22} /></span>}
        <div className="title">
          {sloganOf(school)}
          <small>{school.shortName} 학교장 인증제{IS_EMULATOR ? " · TEST" : ""}</small>
        </div>
        <div className="spacer" />
        <div className="who">{who}</div>
        {extra}
        <LogoutButton className="" />
      </header>
      {tabs.length > 1 && (
        <>
          <nav className="nav-tabs desktop" aria-label="주 메뉴">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} onClick={guardClick(t.to)} className={({ isActive }) => (isActive ? "active" : "")}>
                <PixelIcon name={t.icon} size={22} />
                <span className="lbl">{t.label}</span>
              </NavLink>
            ))}
          </nav>
          <nav className="nav-tabs phone" aria-label="주 메뉴">
            {phoneTabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} onClick={guardClick(t.to)} className={({ isActive }) => (isActive ? "active" : "")}>
                <PixelIcon name={t.icon} size={26} />
                <span className="lbl">{t.label}</span>
              </NavLink>
            ))}
            {moreTabs.length > 0 && (
              <button className={moreActive ? "active" : ""} onClick={() => setMore(true)}>
                <PixelIcon name="gamepad" size={26} />
                <span className="lbl">더보기</span>
              </button>
            )}
          </nav>
          {more && (
            <div className="sheet-backdrop" onClick={() => setMore(false)}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <div className="hud small muted">MENU</div>
                <div className="sheet-grid">
                  {moreTabs.map((t) => (
                    <NavLink key={t.to} to={t.to} end={t.end} onClick={(e) => { setMore(false); guardClick(t.to)(e); }} className={({ isActive }) => `sheet-item ${isActive ? "active" : ""}`}>
                      <PixelIcon name={t.icon} size={32} />
                      <span>{t.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <main>{children}</main>
    </div>
  );
}

/** 탭 안쪽 화면용 제목 줄: ← 뒤로 + 아이콘 + 제목 + 오른쪽 도구 */
export function PageHeader({ title, back, right, icon }: { title: ReactNode; back?: string; right?: ReactNode; icon?: string }) {
  const nav = useNavigate();
  return (
    <div className="page-head">
      {back && (
        <button className="back-btn" onClick={() => nav(back)} aria-label="뒤로">
          <PixelIcon name="back" size={22} />
        </button>
      )}
      {icon && <PixelIcon name={icon} size={30} />}
      <h1>{title}</h1>
      {right && <div className="page-head-right">{right}</div>}
    </div>
  );
}
