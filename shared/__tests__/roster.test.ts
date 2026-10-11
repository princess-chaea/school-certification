import { describe, expect, it } from "vitest";
import { parseRosterCsv, validateRosterRows, validateNameUpdateRows, canUpdateClassStudentNames } from "../roster";
const row = { sid: "student", grade: 1, classNo: 2, number: 3, name: " 하늘 " };
describe("offline roster and name changes", () => {
  it("supports unnamed no-account pupils identified by explicit seat", () => {
    const result = parseRosterCsv("학년,반,번호\n1,2,3\n");
    expect(result.errors).toEqual([]);
    expect(validateRosterRows(result.rows)).toEqual([{ grade: 1, classNo: 2, number: 3, name: "", email: "" }]);
    expect(parseRosterCsv("학년,반,번호,이름,이메일\n1,2,,,\n").errors).toHaveLength(1);
  });
  it.each(["-1", "1.5", "1abc", "0"])("rejects malformed explicit number %s", (number) => {
    expect(parseRosterCsv(`학년,반,번호,이름\n1,2,${number},하늘\n`).errors).toHaveLength(1);
  });
  it("rejects duplicate seats and case-insensitive duplicate emails before server writes", () => {
    const r = { grade: 1, classNo: 2, number: 3, name: "", email: "" };
    expect(() => validateRosterRows([r, { ...r, email: "a@x.kr" }])).toThrow(/중복/);
    expect(() => validateRosterRows([{ ...r, email: "A@x.kr" }, { ...r, number: 4, email: "a@x.kr" }])).toThrow(/중복/);
    expect(parseRosterCsv("학년,반,번호,이름\n1,2,3,하늘\n1,2,3,바다\n").errors).toHaveLength(1);
    expect(() => validateRosterRows([{ ...r, number: 0 }])).toThrow();
  });
  it("validates name-only rows and grade scope", () => {
    expect(validateNameUpdateRows([row], 1, null)).toEqual([{ ...row, name: "하늘" }]);
    for (const value of [[row, row], [{ ...row, sid: "../x" }], [{ ...row, name: " " }], [{ ...row, name: "가".repeat(31) }], [{ ...row, grade: 2 }], [{ ...row, classNo: 3 }]]) expect(() => validateNameUpdateRows(value, 1, 2)).toThrow();
    expect(() => validateNameUpdateRows(Array.from({length:401}, (_,i)=>({...row,sid:`s${i}`})),1,null)).toThrow();
  });
  it("permits only active administrators or teachers assigned the row class", () => {
    expect(canUpdateClassStudentNames({ role: "admin", status: "active" }, 1, 2)).toBe(true);
    expect(canUpdateClassStudentNames({ role: "admin", status: "pending" }, 1, 2)).toBe(false);
    expect(canUpdateClassStudentNames({ role: "teacher", status: "active", homeroom: true, grade: 1, classNo: 2 }, 1, 2)).toBe(true);
    expect(canUpdateClassStudentNames({ role: "teacher", status: "active", homeroom: true, grade: 1, classNo: 3 }, 1, 2)).toBe(false);
    const staff = { role: "teacher", status: "active", subject: true, grades: [1], subjectClasses: [{ grade: 1, classNo: 2 }] };
    expect(canUpdateClassStudentNames(staff,1,2)).toBe(true);
    expect(canUpdateClassStudentNames(staff,1,3)).toBe(false);
    expect(canUpdateClassStudentNames(staff,2,2)).toBe(false);
    expect(canUpdateClassStudentNames({role:"teacher",status:"active"},1,2)).toBe(false);
  });
});
