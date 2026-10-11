import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { matchesStaffAssignmentFilter, StaffManager } from "./Members";
import type { StaffDoc } from "../../lib/types";

const staff: (StaffDoc & { id: string })[] = [
  { id: "admin", uid: "admin", role: "admin", status: "active", name: "관리자교사", email: "admin@example.test", homeroom: true, grade: 4, classNo: 1, certificationPrograms: ["reading"] },
  { id: "teacher", uid: "teacher", role: "teacher", status: "active", name: "전담교사", email: "teacher@example.test", subject: true, grades: [5, 3], subjectClasses: [{ grade: 3, classNo: 2 }], programs: ["english"] },
];

describe("교사 담당과 학년의 이중 필터", () => {
  const overlapping: StaffDoc = { ...staff[0], subject: true, grades: [5] };
  const classAssigned: StaffDoc = { ...staff[1], grades: [6], subjectClasses: [{ grade: 6, classNo: 2 }] };
  const noDuty: StaffDoc = { ...staff[1], homeroom: false, subject: false, grade: 4, certificationPrograms: ["english"] };

  it("전체 선택은 관리자 겸임자와 담당 미지정 교사를 모두 포함한다", () => {
    expect([staff[0], staff[1], noDuty].every((s) => matchesStaffAssignmentFilter(s, "all", "all"))).toBe(true);
  });

  it("담임 학년과 전담 학년을 선택한 역할 안에서만 비교한다", () => {
    expect(matchesStaffAssignmentFilter(overlapping, "homeroom", 4)).toBe(true);
    expect(matchesStaffAssignmentFilter(overlapping, "subject", 5)).toBe(true);
    expect(matchesStaffAssignmentFilter(overlapping, "homeroom", 5)).toBe(false);
    expect(matchesStaffAssignmentFilter(overlapping, "subject", 4)).toBe(false);
  });

  it("학년 전체에서는 선택한 담당 역할만 적용한다", () => {
    expect(matchesStaffAssignmentFilter(staff[0], "homeroom", "all")).toBe(true);
    expect(matchesStaffAssignmentFilter(staff[1], "subject", "all")).toBe(true);
    expect(matchesStaffAssignmentFilter(staff[0], "subject", "all")).toBe(false);
    expect(matchesStaffAssignmentFilter(staff[1], "homeroom", "all")).toBe(false);
  });

  it("전담은 담당 학년에 포함되고 개별 학반 제한도 충족하는 학년으로 검색된다", () => {
    expect(matchesStaffAssignmentFilter(staff[1], "subject", 3)).toBe(true);
    expect(matchesStaffAssignmentFilter(staff[1], "subject", 5)).toBe(false);
    expect(matchesStaffAssignmentFilter({ ...staff[1], subjectClasses: [] }, "subject", 5)).toBe(true);
    expect(matchesStaffAssignmentFilter(classAssigned, "subject", 6)).toBe(true);
    expect(matchesStaffAssignmentFilter(classAssigned, "subject", 3)).toBe(false);
  });

  it("개별 담당 학반에만 남아 있고 담당 학년에서 빠진 학년은 검색되지 않는다", () => {
    const staleClass: StaffDoc = { ...classAssigned, grades: [3] };
    expect(matchesStaffAssignmentFilter(staleClass, "subject", 6)).toBe(false);
    expect(matchesStaffAssignmentFilter(staleClass, "all", 6)).toBe(false);
    expect(matchesStaffAssignmentFilter({ ...staleClass, grades: [] }, "subject", 6)).toBe(false);
  });

  it("담당 전체와 학년을 함께 선택하면 담임 또는 전담의 일치 학년을 포함한다", () => {
    expect(matchesStaffAssignmentFilter(overlapping, "all", 4)).toBe(true);
    expect(matchesStaffAssignmentFilter(overlapping, "all", 5)).toBe(true);
    expect(matchesStaffAssignmentFilter(classAssigned, "all", 6)).toBe(true);
    expect(matchesStaffAssignmentFilter(overlapping, "all", 2)).toBe(false);
  });

  it("담당이 꺼진 교사는 남아 있는 학년 값이나 인증 업무만으로 검색되지 않는다", () => {
    expect(matchesStaffAssignmentFilter(noDuty, "homeroom", "all")).toBe(false);
    expect(matchesStaffAssignmentFilter(noDuty, "subject", "all")).toBe(false);
    expect(matchesStaffAssignmentFilter(noDuty, "all", 4)).toBe(false);
    expect(matchesStaffAssignmentFilter(noDuty, "all", 5)).toBe(false);
  });
});

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
    expect(html).not.toContain("담당 유형");
    expect(html).not.toContain("담당 학년");
  });

  it("교사 목록에는 관리자 겸임자와 전담 교사가 함께 나온다", () => {
    const html = renderToStaticMarkup(<StaffManager role="teacher" />);
    expect(html).toContain("관리자교사");
    expect(html).toContain("전담교사");
    expect(html).toContain("담임 4학년 1반");
    expect(html).toContain("전담 3학년 (3-2반)");
    expect(html).toContain("인증 업무");
    expect(html).toContain("권한 변경");
  });

  it("교사 목록은 담당 유형과 학년을 각각 선택하고 표시된 교사를 일괄 선택할 수 있다", () => {
    const html = renderToStaticMarkup(<StaffManager role="teacher" />);
    expect(html).toMatch(/<label[^>]*><span>담당 유형<\/span><select[^>]*>/);
    expect(html).toMatch(/<label[^>]*><span>담당 학년<\/span><select[^>]*>/);
    expect(html).toContain('<option value="homeroom">담임</option>');
    expect(html).toContain('<option value="subject">전담</option>');
    for (let grade = 1; grade <= 6; grade++) {
      expect(html).toContain(`<option value="${grade}">${grade}학년</option>`);
    }
    expect(html).toContain('aria-label="표시된 승인 교사 모두 선택"');
  });
});
