import { Navigate, Route, Routes } from "react-router-dom";
import { Layout, type Tab } from "../../components/Layout";
import type { StaffDoc } from "../../lib/types";
import { ScopeProvider } from "./scope";
import { Overview } from "./Overview";
import { Feed } from "./Feed";
import { Review } from "./Review";
import { Bulk } from "./Bulk";
import { StudentDetail } from "./StudentDetail";
import { AdminHome } from "../admin/AdminHome";
import { Members } from "../admin/Members";
import { Settings } from "../admin/Settings";
import { Certificates } from "../admin/Certificates";
import { ProgramsAdmin } from "../admin/ProgramsAdmin";
import { MyRoles } from "./MyRoles";

/** 교사·학교 담당자 공통 화면 틀 (모든 학교 동일) */
export function StaffApp({ staff, isSuper, onSuper }: { staff: StaffDoc; isSuper: boolean; onSuper: () => void }) {
  const isAdmin = staff.role === "admin";
  const tabs: Tab[] = [
    { to: "/", icon: "chart", label: "현황", end: true },
    { to: "/review", icon: "check", label: "확인하기" },
    { to: "/feed", icon: "log", label: "기록" },
    { to: "/bulk", icon: "eye", label: "일괄 체크" },
    ...(isAdmin
      ? [
          { to: "/admin", icon: "school", label: "전교", end: true },
          { to: "/admin/programs", icon: "gamepad", label: "인증 항목" },
          { to: "/admin/members", icon: "users", label: "구성원" },
          { to: "/admin/certs", icon: "trophy", label: "인증서" },
          { to: "/admin/settings", icon: "gear", label: "설정" },
        ]
      : []),
    { to: "/me", icon: "hand", label: "내 역할" },
  ];
  const roles = [isAdmin && "학교 담당자", staff.homeroom && `${staff.grade}-${staff.classNo} 담임`, staff.subject && "전담"].filter(Boolean).join(" · ");
  return (
    <ScopeProvider staff={staff}>
      <Layout who={`${staff.name} 선생님 · ${roles || "교사"}`} tabs={tabs} extra={isSuper ? <button onClick={onSuper}>시스템</button> : undefined}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/review" element={<Review />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/bulk" element={<Bulk />} />
          <Route path="/student/:sid" element={<StudentDetail />} />
          <Route path="/me" element={<MyRoles staff={staff} />} />
          {isAdmin && (
            <>
              <Route path="/admin" element={<AdminHome />} />
              <Route path="/admin/programs" element={<ProgramsAdmin />} />
              <Route path="/admin/members" element={<Members />} />
              <Route path="/admin/certs" element={<Certificates />} />
              <Route path="/admin/settings" element={<Settings />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </ScopeProvider>
  );
}
