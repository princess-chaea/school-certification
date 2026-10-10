import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useSession } from "./lib/auth";
import { SchoolProvider, useSchool } from "./lib/school";
import { ConfigProvider } from "./lib/config";
import { TenantCtx } from "./lib/tenant";
import { Login } from "./pages/Login";
import { PendingApproval, TeacherSignup } from "./pages/TeacherSignup";
import { SuperConsole } from "./pages/SuperConsole";
import { Layout } from "./components/Layout";
import { Loading, ToastHost } from "./components/ui";
import { StudentHome, ProgramList, ProgramPage, CertificateList } from "./pages/student/Programs";
import { Records } from "./pages/student/Records";
import { CertificatePage } from "./pages/student/CertificatePage";
import { StaffApp } from "./pages/teacher/StaffApp";
import type { StaffDoc, StudentDoc } from "./lib/types";
import type { User } from "firebase/auth";

export function App() {
  return (
    <AuthProvider>
      <Gate />
      <ToastHost />
    </AuthProvider>
  );
}

function Gate() {
  const s = useSession();
  const [superMode, setSuperMode] = useState(false);
  if (s.kind === "loading") return <Loading label="학교를 찾는 중…" />;
  if (s.kind === "signedOut") return <Login />;
  if ((s.kind === "staffNew" || s.kind === "staff") && s.isSuper && superMode) return <SuperConsole onBack={() => setSuperMode(false)} />;
  if (s.kind === "staffNew") return <TeacherSignup user={s.user} isSuper={s.isSuper} onSuper={() => setSuperMode(true)} />;
  const schoolId = s.schoolId;
  return (
    <TenantCtx.Provider value={schoolId}>
      <SchoolProvider schoolId={schoolId}>
        <ConfigProvider schoolId={schoolId}>
          {s.kind === "student" ? (
            s.student ? <StudentApp student={s.student} /> : <Loading label={s.error ? `학생 정보를 불러오지 못했어요: ${s.error}` : "학생 정보를 준비하는 중…"} />
          ) : s.staff.status !== "active" ? (
            <PendingWithSchool staff={s.staff} user={s.user} />
          ) : (
            <StaffApp staff={s.staff} isSuper={s.isSuper} onSuper={() => setSuperMode(true)} />
          )}
        </ConfigProvider>
      </SchoolProvider>
    </TenantCtx.Provider>
  );
}

function PendingWithSchool({ staff, user }: { staff: StaffDoc; user: User }) {
  const school = useSchool();
  return <PendingApproval staff={staff} user={user} schoolName={school.name} />;
}

function StudentApp({ student }: { student: StudentDoc }) {
  // 모든 학교 공통 학생 탭 (학교별 인증 항목은 [인증하기] 안에서 보여 줌)
  const tabs = [
    { to: "/", icon: "home", label: "홈", end: true },
    { to: "/do", icon: "plus", label: "인증하기" },
    { to: "/records", icon: "log", label: "내 기록" },
    { to: "/certs", icon: "trophy", label: "인증서" },
  ];
  return (
    <Layout who={`${student.grade}-${student.classNo} ${student.name}`} tabs={tabs}>
      <Routes>
        <Route path="/" element={<StudentHome student={student} />} />
        <Route path="/do" element={<ProgramList student={student} />} />
        <Route path="/do/:programId" element={<ProgramPage student={student} />} />
        <Route path="/do/:programId/:taskId" element={<ProgramPage student={student} />} />
        <Route path="/do/:programId/:taskId/:no" element={<ProgramPage student={student} />} />
        <Route path="/records" element={<Records student={student} />} />
        <Route path="/certs" element={<CertificateList student={student} />} />
        <Route path="/certs/:program" element={<CertificatePage student={student} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
