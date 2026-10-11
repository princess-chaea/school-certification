import { describe, expect, it } from "vitest";
import { createNameRosterCsv, decodeNameRosterCsv, parseNameRosterCsv } from "./nameRosterCsv";

const students = [
  { id: "nomail-2026-1-1-01", grade: 1, classNo: 1, number: 1, name: "" },
  { id: "student@example.com", grade: 1, classNo: 1, number: 2, name: "기존 이름" },
];
const csv = (rows: string) => "\uFEFF학생ID,학년,반,번호,이름\r\n" + rows;

describe("name-only student CSV", () => {
  it("round-trips BOM, commas, quotes and existing names without changes", () => {
    const list = [{ ...students[0], name: '김, "하늘"' }, students[1]];
    const text = createNameRosterCsv(list);
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(parseNameRosterCsv(text, list)).toEqual({ rows: [], unchanged: 2 });
  });
  it("updates only trimmed nonblank names, with stable student identifiers", () => {
    const parsed = parseNameRosterCsv(csv(`${students[0].id},1,1,1, 하늘 \n${students[1].id},1,1,2,`), students);
    expect(parsed).toEqual({ rows: [{ sid: students[0].id, grade: 1, classNo: 1, number: 1, name: "하늘" }], unchanged: 1 });
  });
  it("rejects unknown students even when their name is blank", () => {
    expect(() => parseNameRosterCsv(csv("outsider,1,1,1,"), students)).toThrow("현재 화면의 학생이 아니에요");
  });
  it.each(["2,1,1", "1,2,1", "1,1,2", "1,1,1e0"])("rejects altered identity columns %s", (identity) => {
    expect(() => parseNameRosterCsv(csv(`${students[0].id},${identity},`), students)).toThrow("학년·반·번호");
  });
  it("rejects duplicate IDs including unchanged rows", () => {
    const row = `${students[0].id},1,1,1,`;
    expect(() => parseNameRosterCsv(csv(`${row}\n${row}`), students)).toThrow("두 번");
  });
  it("rejects missing header, extra columns, empty files and overlong names", () => {
    expect(() => parseNameRosterCsv("학년,반,번호,이름\n1,1,1,가", students)).toThrow("열이 필요");
    expect(() => parseNameRosterCsv(csv(`${students[0].id},1,1,1,가,이메일`), students)).toThrow("열 개수");
    expect(() => parseNameRosterCsv(csv(""), students)).toThrow("학생 행");
    expect(() => parseNameRosterCsv(csv(`${students[0].id},1,1,1,${"가".repeat(31)}`), students)).toThrow("30자");
  });
  it("rejects more than 400 rows before accepting any updates", () => {
    expect(() => parseNameRosterCsv(csv(Array.from({ length: 401 }, () => `${students[0].id},1,1,1,가`).join("\n")), students)).toThrow("400명");
  });
  it("exports formula-like names as text and round-trips them", () => {
    const list = [{ ...students[0], name: "=1+1" }];
    expect(createNameRosterCsv(list)).toContain("'=1+1");
    expect(parseNameRosterCsv(createNameRosterCsv(list), list).rows).toEqual([]);
  });
  it("escapes formula-like names after leading whitespace or control characters", () => {
    for (const name of [" =1+1", "\t=1+1", "\r=1+1"]) {
      expect(createNameRosterCsv([{ ...students[0], name }])).toContain(`"'${name.replace(/"/g, '""')}"`);
    }
  });
  it("reads Excel's Korean CSV encoding as well as UTF-8", () => {
    const cp949 = Uint8Array.from([199,208,187,253,73,68,44,199,208,179,226,44,185,221,44,185,248,200,163,44,192,204,184,167,13,10,110,111,109,97,105,108,45,50,48,50,54,45,49,45,49,45,48,49,44,49,44,49,44,49,44,199,207,180,195,13,10]);
    expect(parseNameRosterCsv(decodeNameRosterCsv(cp949.buffer), students).rows[0].name).toBe("하늘");
    expect(decodeNameRosterCsv(new TextEncoder().encode(createNameRosterCsv(students)).buffer)).toContain("학생ID");
  });
  it("rejects newline/control characters in names", () => {
    expect(() => parseNameRosterCsv(csv(`${students[0].id},1,1,1,"두\n줄"`), students)).toThrow("줄바꿈");
  });
  it.each(['"닫히지 않음', '가"나', '"가"나'])("rejects malformed CSV quoting %s", (name) => {
    expect(() => parseNameRosterCsv(csv(`${students[0].id},1,1,1,${name}`), students)).toThrow("따옴표");
  });
});
