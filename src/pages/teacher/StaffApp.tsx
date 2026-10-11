import { PixelIcon } from "../../components/Pixel";
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
import { CertificationStatus } from "./CertificationStatus";

/** 교사·관리자 공통 화면 틀 (모든 학교 동일) */
export function StaffApp({ staff, isSuper, onSuper }: { staff: StaffDoc; isSuper: boolean; onSuper: () => void }) {
  const isAdmin = staff.role === "admin";
  const canTeach = isAdmin || Boolean(staff.homeroom || staff.subject);
  const canBulk = isAdmin || (canTeach && Boolean(staff.bulkRecognitionPrograms?.length));
  const canStatus = isAdmin || Boolean(staff.certificationPrograms?.length);
  const landing = canTeach ? "/" : canStatus ? "/certification-status" : "/me";
  const tabs: Tab[] = [
    ...(canTeach ? [{ to: "/", icon: "chart", label: "현황", end: true },
    { to: "/review", icon: "check", label: "확인하기" },
    { to: "/feed", icon: "log", label: "기록" }] : []),
    ...(canBulk ? [{ to: "/bulk", icon: "eye", label: "일괄 체크" }] : []),
    ...(canStatus ? [{ to: "/certification-status", icon: "trophy", label: "인증 현황" }] : []),
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
  const roles = [isAdmin && "관리자", staff.homeroom && `${staff.grade}-${staff.classNo} 담임`, staff.subject && "전담", Boolean(staff.certificationPrograms?.length) && "인증 업무 담당"].filter(Boolean).join(" · ");
  return (
    <ScopeProvider staff={staff}>
      <Layout who={`${staff.name} 선생님 · ${roles || "교사"}`} tabs={tabs} extra={isSuper ? <button onClick={onSuper} aria-label="시스템" title="시스템"><PixelIcon name="gear" size={16} /><span className="hdr-lbl"> 시스템</span></button> : undefined}>
        <Routes>
          <Route path="/" element={canTeach ? <Overview /> : <Navigate to={landing} replace />} />
          <Route path="/review" element={canTeach ? <Review /> : <Navigate to={landing} replace />} />
          <Route path="/feed" element={canTeach ? <Feed /> : <Navigate to={landing} replace />} />
          <Route path="/bulk" element={canBulk ? <Bulk /> : <Navigate to={landing} replace />} />
          <Route path="/certification-status" element={canStatus ? <CertificationStatus staff={staff} /> : <Navigate to={landing} replace />} />
          <Route path="/student/:sid" element={canTeach ? <StudentDetail /> : <Navigate to={landing} replace />} />
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
          <Route path="*" element={<Navigate to={landing} replace />} />
        </Routes>
      </Layout>
    </ScopeProvider>
  );
}
