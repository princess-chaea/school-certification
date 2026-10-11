import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StaffManager } from "./Members";

const staff = [
  { id: "admin", uid: "admin", role: "admin", status: "active", name: "관리자교사", email: "admin@example.test", homeroom: true, grade: 4, classNo: 1, certificationPrograms: ["reading"] },
  { id: "teacher", uid: "teacher", role: "teacher", status: "active", name: "전담교사", email: "teacher@example.test", subject: true, grades: [5, 3], subjectClasses: [{ grade: 3, classNo: 2 }], programs: ["english"] },
];

vi.mock("../../firebase", () => ({ db: {}, functions: {} }));
vi.mock("../../lib/tenant", () => ({ useSchoolId: () => "test-school", sp: () => "school/staff" }));
vi.mock("../../lib/data", () => ({ useCollection: () => ({ rows: staff }) }));
vi.mock("../../lib/config", async () => {
  const { DEFAULT_CONFIG } = await import("../../../shared/domain");
  return { useConfig: () => DEFAULT_CONFIG };
});
vi.mock("../../lib/auth", () => ({ useSession: () => ({ kind: "staff", user: { uid: "admin" } }) }));
vi.mock("../../lib/school", () => ({ useSchool: () => ({ year: 2026 }) }));
vi.mock("../../components/Modal", () => ({ Modal: () => null, askConfirm: vi.fn(), askText: vi.fn(), notice: vi.fn() }));
vi.mock("../../lib/students", () => ({ deleteStudentFlow: vi.fn() }));

describe("구성원 관리의 겸임 역할 표시", () => {
  it("관리자 목록에는 관리자 정보만 보이고 교사 담당은 표시하지 않는다", () => {
    const html = renderToStaticMarkup(<StaffManager role="admin" />);
    expect(html).toContain("관리자교사");
    expect(html).not.toContain("전담교사");
    expect(html).not.toContain("<th>담당</th>");
    expect(html).not.toContain("담당 수정");
  });

  it("교사 목록에는 관리자 겸임자와 전담 교사가 함께 나온다", () => {
    const html = renderToStaticMarkup(<StaffManager role="teacher" />);
    expect(html).toContain("관리자교사");
    expect(html).toContain("전담교사");
    expect(html).toContain("담임 4학년 1반");
    expect(html).toContain("전담 3·5학년 (3-2반)");
    expect(html).toContain("인증 업무");
    expect(html).toContain("권한 변경");
  });
});
