import { useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthProvider, useSession } from "./lib/auth";
import { SchoolProvider, useSchool } from "./lib/school";
import { ConfigProvider } from "./lib/config";
import { TenantCtx } from "./lib/tenant";
import { Login } from "./pages/Login";
import { PendingApproval, TeacherSignup } from "./pages/TeacherSignup";
import { SuperConsole } from "./pages/SuperConsole";
import { Layout } from "./components/Layout";
import { Loading, ToastHost } from "./components/ui";
import { StudentHome } from "./pages/student/StudentHome";
import { SubmitPage } from "./pages/student/SubmitPage";
import { EnglishRoom, SentenceSetPage } from "./pages/student/EnglishRoom";
import { SentencePractice } from "./pages/student/SentencePractice";
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
  if (s.kind === "staffNew") return <TeacherSignup user={s.user} request={s.request} isSuper={s.isSuper} onSuper={() => setSuperMode(true)} />;
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
  const english = student.grade >= 4;
  const tabs = [
    { to: "/", icon: "🏠", label: "나의 도전", end: true },
    { to: "/submit/reading", icon: "📚", label: "독서" },
    { to: "/submit/carbon", icon: "🌏", label: "탄소중립" },
    ...(english ? [{ to: "/english", icon: "🗣️", label: "영어" }] : []),
    { to: "/records", icon: "📒", label: "내 기록" },
  ];
  return (
    <Layout who={`${student.grade}-${student.classNo} ${student.name}`} tabs={tabs}>
      <Routes>
        <Route path="/" element={<StudentHome student={student} />} />
        <Route path="/submit/:kind" element={<SubmitPage student={student} />} />
        <Route path="/english" element={<EnglishRoom student={student} />} />
        <Route path="/english/set/:setId" element={<SetRoute student={student} />} />
        <Route path="/english/set/:setId/:no" element={<PracticeRoute student={student} />} />
        <Route path="/records" element={<Records student={student} />} />
        <Route path="/cert/:program" element={<CertificatePage student={student} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

function SetRoute({ student }: { student: StudentDoc }) {
  const { setId = "" } = useParams();
  return <SentenceSetPage student={student} setId={setId} />;
}
function PracticeRoute({ student }: { student: StudentDoc }) {
  const { setId = "", no = "1" } = useParams();
  return <SentencePractice student={student} setId={setId} no={Number(no)} />;
}
