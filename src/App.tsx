import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthProvider, useSession } from "./lib/auth";
import { ConfigProvider } from "./lib/config";
import { Login } from "./pages/Login";
import { PendingApproval, TeacherSignup } from "./pages/TeacherSignup";
import { Layout } from "./components/Layout";
import { Loading, ToastHost } from "./components/ui";
import { StudentHome } from "./pages/student/StudentHome";
import { SubmitPage } from "./pages/student/SubmitPage";
import { EnglishRoom, SentenceSetPage } from "./pages/student/EnglishRoom";
import { SentencePractice } from "./pages/student/SentencePractice";
import { Records } from "./pages/student/Records";
import { CertificatePage } from "./pages/student/CertificatePage";
import { StaffApp } from "./pages/teacher/StaffApp";
import type { StudentDoc } from "./lib/types";

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
  const signedIn = s.kind !== "loading" && s.kind !== "signedOut";
  return (
    <ConfigProvider enabled={signedIn}>
      {s.kind === "loading" ? (
        <Loading />
      ) : s.kind === "signedOut" ? (
        <Login />
      ) : s.kind === "student" ? (
        s.student ? <StudentApp student={s.student} /> : <Loading label={s.error ? `학생 정보를 불러오지 못했어요: ${s.error}` : "학생 정보를 준비하는 중…"} />
      ) : s.kind === "staffNew" ? (
        <TeacherSignup user={s.user} />
      ) : s.staff.status !== "active" ? (
        <PendingApproval staff={s.staff} user={s.user} />
      ) : (
        <StaffApp staff={s.staff} />
      )}
    </ConfigProvider>
  );
}

function StudentApp({ student }: { student: StudentDoc }) {
  const tabs = [
    { to: "/", label: "🏠 나의 도전", end: true },
    { to: "/submit/reading", label: "📚 독서" },
    { to: "/submit/carbon", label: "🌏 탄소중립" },
    ...(student.grade >= 4 ? [{ to: "/english", label: "🗣️ 영어" }] : []),
    { to: "/records", label: "📒 내 기록" },
  ];
  return (
    <Layout who={`${student.grade}-${student.classNo} ${student.name || student.sid}`} tabs={tabs}>
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
