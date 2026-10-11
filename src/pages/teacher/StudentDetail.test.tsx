import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffDoc, StudentDoc } from "../../lib/types";
import { canEditStudentFeedback, StudentDetail } from "./StudentDetail";

const state = vi.hoisted(() => ({ staff: {} as StaffDoc, feedback: "꾸준한 도전이 멋져요!" }));
const student: StudentDoc = { sid: "student", email: "", year: 2026, grade: 4, classNo: 1, number: 1, name: "학생", active: true, hasAccount: false };
const subject: StaffDoc = { uid: "teacher", name: "전담교사", email: "", role: "teacher", status: "active", subject: true, grades: [4], programs: ["english"] };

vi.mock("react-router-dom", () => ({ useParams: () => ({ sid: "student" }), useNavigate: () => vi.fn() }));
vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("../../lib/tenant", () => ({ useSchoolId: () => "school", sp: (_school: string, path: string) => path }));
vi.mock("../../lib/auth", () => ({ useSession: () => ({ kind: "staff", staff: state.staff }) }));
vi.mock("../../lib/config", async () => {
  const { DEFAULT_CONFIG } = await import("../../../shared/domain");
  return { useConfig: () => DEFAULT_CONFIG };
});
vi.mock("../../lib/data", () => ({ useCollection: () => ({ rows: [] }) }));
vi.mock("./scope", () => ({ useScope: () => ({ scope: {}, allowedPrograms: [], isAdmin: false }) }));
vi.mock("./Overview", () => ({ useScopedStudents: () => ({ rows: [{ ...student, id: "student", feedback: state.feedback, feedbackByName: "담임교사" }] }) }));
vi.mock("../../components/Layout", () => ({ PageHeader: () => null }));
vi.mock("../../components/ui", () => ({ Lightbox: () => null, StorageAudio: () => null, StorageImage: () => null, toast: vi.fn() }));
vi.mock("../../components/Modal", () => ({ askText: vi.fn() }));
vi.mock("../../lib/students", () => ({ deleteStudentFlow: vi.fn() }));

describe("shared student feedback ownership", () => {
  beforeEach(() => { state.staff = { ...subject }; state.feedback = "꾸준한 도전이 멋져요!"; });

  it("allows an active administrator or the student's assigned homeroom teacher", () => {
    expect(canEditStudentFeedback({ ...subject, role: "admin" }, student)).toBe(true);
    expect(canEditStudentFeedback({ ...subject, homeroom: true, grade: 4, classNo: 1 }, student)).toBe(true);
  });

  it("denies subject-only, another homeroom, certification-only and inactive staff", () => {
    expect(canEditStudentFeedback(subject, student)).toBe(false);
    expect(canEditStudentFeedback({ ...subject, homeroom: true, grade: 4, classNo: 2 }, student)).toBe(false);
    expect(canEditStudentFeedback({ ...subject, subject: false, certificationPrograms: ["english"] }, student)).toBe(false);
    expect(canEditStudentFeedback({ ...subject, role: "admin", status: "rejected" }, student)).toBe(false);
    expect(canEditStudentFeedback(null, student)).toBe(false);
    expect(canEditStudentFeedback(subject, null)).toBe(false);
  });

  it("keeps existing feedback and student records visible to a subject teacher without editing controls", () => {
    const html = renderToStaticMarkup(<StudentDetail />);
    expect(html).toContain(state.feedback);
    expect(html).toContain("담임교사");
    expect(html).toContain("기록 (0)");
    expect(html).not.toContain("고치기</button>");
    expect(html).not.toContain("지우기</button>");
    expect(html).not.toContain("<textarea");
  });

  it("does not offer a new feedback entry to subject-only teachers", () => {
    state.feedback = "";
    expect(renderToStaticMarkup(<StudentDetail />)).not.toContain("한마디 남기기</button>");
  });

  it("shows editing and removal controls for the assigned homeroom teacher", () => {
    state.staff = { ...subject, homeroom: true, grade: 4, classNo: 1 };
    const html = renderToStaticMarkup(<StudentDetail />);
    expect(html).toContain("고치기</button>");
    expect(html).toContain("지우기</button>");
  });
});
