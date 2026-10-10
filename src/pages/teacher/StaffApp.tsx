import { Navigate, Route, Routes } from "react-router-dom";
import { Layout, type Tab } from "../../components/Layout";
import type { StaffDoc } from "../../lib/types";
import { ScopeProvider } from "./scope";
import { Overview } from "./Overview";
import { Feed } from "./Feed";
import { Queue } from "./Queue";
import { Bulk } from "./Bulk";
import { StudentDetail } from "./StudentDetail";
import { AdminHome } from "../admin/AdminHome";
import { Members } from "../admin/Members";
import { Settings } from "../admin/Settings";
import { Certificates } from "../admin/Certificates";

export function StaffApp({ staff, isSuper, onSuper }: { staff: StaffDoc; isSuper: boolean; onSuper: () => void }) {
  const isAdmin = staff.role === "admin";
  const homeroom = staff.teacherType === "homeroom";
  const canEnglish = isAdmin || (homeroom ? (staff.grade ?? 0) >= 4 : (staff.programs ?? []).includes("english"));
  const canBulk = isAdmin || homeroom || (staff.programs ?? []).some((p) => p !== "english");
  const tabs: Tab[] = [
    { to: "/", icon: "🏫", label: "현황", end: true },
    { to: "/feed", icon: "📥", label: "제출 기록" },
    ...(canEnglish ? [{ to: "/queue", icon: "🙋", label: "영어 검사" }] : []),
    ...(canBulk ? [{ to: "/bulk", icon: "✅", label: "일괄 체크" }] : []),
    ...(isAdmin
      ? [
          { to: "/admin", icon: "📊", label: "전교" },
          { to: "/admin/members", icon: "👥", label: "구성원" },
          { to: "/admin/certs", icon: "🏅", label: "인증서" },
          { to: "/admin/settings", icon: "⚙️", label: "설정" },
        ]
      : []),
  ];
  const role = isAdmin ? "관리자" : staff.teacherType === "homeroom" ? `${staff.grade}-${staff.classNo} 담임` : "전담";
  return (
    <ScopeProvider staff={staff}>
      <Layout who={`${staff.name} 선생님 · ${role}`} tabs={tabs} extra={isSuper ? <button onClick={onSuper}>운영자</button> : undefined}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/bulk" element={<Bulk />} />
          <Route path="/student/:sid" element={<StudentDetail />} />
          {isAdmin && (
            <>
              <Route path="/admin" element={<AdminHome />} />
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
