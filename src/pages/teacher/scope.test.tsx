import { describe, expect, it, vi } from "vitest";
import type { StaffDoc } from "../../lib/types";
import { canTeachClassProgram, resolveTeachingScope } from "./scope";

vi.mock("../../lib/config", () => ({ useConfig: () => ({}) }));
const programs = [{ id: "reading", grades: [1, 2, 3, 4, 5, 6] }, { id: "english", grades: [4, 5, 6] }];
const staff: StaffDoc = { uid: "t", name: "T", email: "t@example.test", role: "teacher", status: "active", subject: true, grades: [4, 5], programs: ["english"], subjectClasses: [{ grade: 4, classNo: 2 }, { grade: 4, classNo: 4 }, { grade: 5, classNo: 3 }] };

describe("class-restricted teaching scope", () => {
  it("never selects a grade-wide query for a restricted subject teacher", () => {
    const resolved = resolveTeachingScope(staff, { grade: 4, classNo: null, program: null }, programs);
    expect(resolved.scope).toEqual({ grade: 4, classNo: 2, program: "english" });
    expect(resolved.canSeeAllClasses).toBe(false);
    expect(resolved.allowedClasses).toEqual([2, 4]);
    expect(resolved.canQuery).toBe(true);
  });
  it("keeps valid class selection and replaces unassigned classes/programs", () => {
    expect(resolveTeachingScope(staff, { grade: 4, classNo: 4, program: "english" }, programs).scope.classNo).toBe(4);
    expect(resolveTeachingScope(staff, { grade: 5, classNo: 4, program: "reading" }, programs).scope).toEqual({ grade: 5, classNo: 3, program: "english" });
  });
  it("intersects grade, class and program assignments", () => {
    const resolved = resolveTeachingScope({ ...staff, grades: [3, 4, 6] }, { grade: 6, classNo: null, program: null }, programs);
    expect(resolved.allowedGrades).toEqual([4]);
    expect(resolved.scope).toEqual({ grade: 4, classNo: 2, program: "english" });
  });
  it("unions homeroom with subject classes while keeping program restrictions outside homeroom", () => {
    const dual = { ...staff, homeroom: true, grade: 4, classNo: 1 };
    const home = resolveTeachingScope(dual, { grade: 4, classNo: 1, program: null }, programs);
    expect(home.allowedClasses).toEqual([1, 2, 4]);
    expect(home.programRequired).toBe(false);
    expect(home.scope.program).toBeNull();
    const subject = resolveTeachingScope(dual, { grade: 4, classNo: 2, program: "reading" }, programs);
    expect(subject.programRequired).toBe(true);
    expect(subject.scope.program).toBe("english");
  });
  it.each([undefined, []])("preserves legacy whole-grade subject scope for %j", (subjectClasses) => {
    const resolved = resolveTeachingScope({ ...staff, subjectClasses }, { grade: 4, classNo: null, program: null }, programs);
    expect(resolved.canSeeAllClasses).toBe(true);
    expect(resolved.scope.classNo).toBeNull();
  });
  it("recomputes scope after assignment revocation", () => {
    const resolved = resolveTeachingScope({ ...staff, subjectClasses: [{ grade: 5, classNo: 3 }] }, { grade: 4, classNo: 2, program: "english" }, programs);
    expect(resolved.scope).toEqual({ grade: 5, classNo: 3, program: "english" });
    expect(resolveTeachingScope({ ...staff, programs: [] }, resolved.scope, programs).canQuery).toBe(false);
  });
  it("does not grant teaching scope for certification duty alone", () => {
    expect(resolveTeachingScope({ ...staff, subject: false, certificationPrograms: ["english"] }, { grade: 4, classNo: null, program: null }, programs).canQuery).toBe(false);
  });
  it("retains administrator whole-school class access", () => {
    const resolved = resolveTeachingScope({ ...staff, role: "admin" }, { grade: 1, classNo: null, program: null }, programs);
    expect(resolved.canSeeAllClasses).toBe(true);
    expect(resolved.scope).toEqual({ grade: 1, classNo: null, program: null });
  });
  it("checks offline recognition against the same class and program intersection", () => {
    expect(canTeachClassProgram(staff, 4, 2, "english")).toBe(true);
    expect(canTeachClassProgram(staff, 4, 1, "english")).toBe(false);
    expect(canTeachClassProgram(staff, 4, 2, "reading")).toBe(false);
    expect(canTeachClassProgram(staff, 6, 3, "english")).toBe(false);
  });
});
