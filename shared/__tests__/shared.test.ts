import { describe, expect, it } from "vitest";
import { isCorrectAnswer, diffWords, firstLetterHint, normalizeSentence, speechMatchRatio } from "../typing";
import { parseNeisSchoolInfo, neisResultMessage, shortSchoolName, mergeSchool, principalTitle } from "../school";
import { parseStudentEmail, makeSid, thresholdsFor, medalFor, DEFAULT_CONFIG, englishProgress, computeProgress, nextStep } from "../domain";
import task1 from "../../data/english/task1-cartoon.json";
import g4 from "../../data/english/task3-grade4.json";
import g5 from "../../data/english/task3-grade5.json";
import g6 from "../../data/english/task3-grade6.json";

describe("typing", () => {
  it("allows case, punctuation, curly quotes and contractions", () => {
    expect(isCorrectAnswer("you haven't changed a bit", "You haven't changed a bit.")).toBe(true);
    expect(isCorrectAnswer("You have not changed a bit!", "You haven’t changed a bit.")).toBe(true);
    expect(isCorrectAnswer("You haven’t  changed a bit", "You haven't changed a bit.")).toBe(true);
    expect(isCorrectAnswer("I cannot wait", "I can't wait!")).toBe(true);
    expect(isCorrectAnswer("Water is self-service", "Water is self-service.")).toBe(true);
    expect(isCorrectAnswer("Water is self - service", "Water is self-service.")).toBe(true);
  });
  it("rejects wrong words and empty input", () => {
    expect(isCorrectAnswer("You haven't change a bit", "You haven't changed a bit.")).toBe(false);
    expect(isCorrectAnswer("", "Okay.")).toBe(false);
    expect(isCorrectAnswer("   ", "Okay.")).toBe(false);
  });
  it("accepts alternatives", () => {
    expect(isCorrectAnswer("Good evening!", "Good morning!", ["Good afternoon!", "Good evening!"])).toBe(true);
    expect(isCorrectAnswer("What does she look like?", "What does he look like?", ["What does she look like?"])).toBe(true);
  });
  it("diffs words", () => {
    const d = diffWords("You has changed bit", "You haven't changed a bit.");
    expect(d.filter((t) => t.kind === "missing").map((t) => t.word)).toEqual(["have", "not", "a"]);
    expect(d.filter((t) => t.kind === "extra").map((t) => t.word)).toEqual(["has"]);
  });
  it("hints first letters", () => {
    expect(firstLetterHint("You haven't changed a bit.")).toBe("Y__ h____'_ c______ a b__.");
    expect(firstLetterHint("It's in the box.")).toBe("I_'_ i_ t__ b__.");
  });
  it("normalizes and measures speech", () => {
    expect(normalizeSentence("I'm from the U.S.")).toBe("i am from the u s");
    expect(speechMatchRatio("I can't wait", "I can't wait!")).toBe(1);
    expect(speechMatchRatio("I wait", "I can't wait!")).toBeCloseTo(0.5);
  });
  it("every sentence in the data accepts itself", () => {
    for (const set of [task1, g4, g5, g6] as any[]) {
      for (const it of set.items) {
        if (!it.en) continue;
        expect(isCorrectAnswer(it.en, it.en, it.alternatives)).toBe(true);
        for (const alt of it.alternatives ?? []) expect(isCorrectAnswer(alt, it.en, it.alternatives)).toBe(true);
      }
    }
  });
});

describe("domain", () => {
  it("parses student emails", () => {
    expect(parseStudentEmail("263101@haju.es.kr")).toEqual({ sid: "263101", grade: 3, classNo: 1, number: 1 });
    expect(parseStudentEmail("266625@HAJU.ES.KR")).toEqual({ sid: "266625", grade: 6, classNo: 6, number: 25 });
    expect(parseStudentEmail("teacher@gmail.com")).toBeNull();
    expect(parseStudentEmail("267101@haju.es.kr")).toBeNull();
    expect(makeSid(3, 1, 1)).toBe("263101");
  });
  it("bronze equals the plan criterion", () => {
    expect(thresholdsFor(DEFAULT_CONFIG, "reading", 3)).toEqual({ bronze: 40, silver: 60, gold: 80 });
    expect(thresholdsFor(DEFAULT_CONFIG, "reading", 2)).toEqual({ bronze: 50, silver: 75, gold: 100 });
    expect(thresholdsFor(DEFAULT_CONFIG, "carbon", 5)).toEqual({ bronze: 20, silver: 30, gold: 40 });
    const t = thresholdsFor(DEFAULT_CONFIG, "carbon", 5)!;
    expect(medalFor(19, t)).toBe("none");
    expect(medalFor(20, t)).toBe("bronze");
    expect(medalFor(40, t)).toBe("gold");
    expect(nextStep(12, t)).toEqual({ medal: "bronze", remaining: 8 });
    expect(nextStep(45, t)).toBeNull();
  });
  it("english medal counts completed tasks", () => {
    expect(englishProgress(DEFAULT_CONFIG, { t1: 30, t2: 1, t3: 10, t4: 0 }).medal).toBe("bronze");
    expect(englishProgress(DEFAULT_CONFIG, { t1: 29, t2: 1, t3: 40, t4: 4 }).medal).toBe("silver");
    expect(englishProgress(DEFAULT_CONFIG, { t1: 30, t2: 1, t3: 40, t4: 4 }).medal).toBe("gold");
  });
  it("english only for grades 4-6", () => {
    const zero = { t1: 0, t2: 0, t3: 0, t4: 0 };
    expect(computeProgress(DEFAULT_CONFIG, 3, { reading: 1, carbon: 1, english: zero }).english).toBeUndefined();
    expect(computeProgress(DEFAULT_CONFIG, 4, { reading: 1, carbon: 1, english: zero }).english?.medal).toBe("none");
  });
});

describe("data", () => {
  it("set ids match file names used by the app", () => {
    expect((task1 as any).setId).toBe("task1-cartoon");
    expect((g4 as any).setId).toBe("task3-grade4");
    expect((g5 as any).setId).toBe("task3-grade5");
    expect((g6 as any).setId).toBe("task3-grade6");
  });
});

describe("school", () => {
  it("parses NEIS schoolInfo", () => {
    const json = { schoolInfo: [
      { head: [{ list_total_count: 1 }, { RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다." } }] },
      { row: [{ ATPT_OFCDC_SC_CODE: "R10", ATPT_OFCDC_SC_NM: "경상북도교육청", SD_SCHUL_CODE: "8750000", SCHUL_NM: "하주초등학교", SCHUL_KND_SC_NM: "초등학교", LCTN_SC_NM: "경상북도", JU_ORG_NM: "경상북도경산교육지원청", ORG_RDNMA: "경상북도 경산시 하양읍", ORG_RDNDA: "1", ORG_TELNO: "053-000-0000" }] },
    ] };
    const r = parseNeisSchoolInfo(json);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ atptCode: "R10", schoolCode: "8750000", name: "하주초등학교", kind: "초등학교", address: "경상북도 경산시 하양읍 1" });
    expect(parseNeisSchoolInfo({ RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." } })).toEqual([]);
    expect(neisResultMessage({ RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." } })).toBe("해당하는 데이터가 없습니다.");
  });
  it("names", () => {
    expect(shortSchoolName("하주초등학교")).toBe("하주초");
    expect(shortSchoolName("경산중학교")).toBe("경산중");
    expect(mergeSchool({ name: "구미고등학교" }).shortName).toBe("구미고");
    expect(principalTitle(mergeSchool(null))).toBe("하주초등학교장 문석주");
  });
  it("student email uses school domain", () => {
    expect(parseStudentEmail("263101@other.es.kr", "other.es.kr")?.grade).toBe(3);
    expect(parseStudentEmail("263101@haju.es.kr", "other.es.kr")).toBeNull();
  });
});

import { parseRosterCsv, parseCsv, studentIdFor, ROSTER_TEMPLATE } from "../roster";
describe("roster csv", () => {
  it("parses the template", () => {
    const r = parseRosterCsv(ROSTER_TEMPLATE);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[2]).toMatchObject({ grade: 1, classNo: 1, number: 1, name: "이하늘", email: "" });
  });
  it("works without number column and assigns numbers by name", () => {
    const r = parseRosterCsv("학년,반,이름,이메일\n4,2,하나,b@x.kr\n4,2,가나,A@X.kr\n");
    expect(r.errors).toEqual([]);
    expect(r.rows.find((x) => x.name === "가나")).toMatchObject({ number: 1, email: "a@x.kr" });
    expect(r.rows.find((x) => x.name === "하나")?.number).toBe(2);
  });
  it("reports bad rows and duplicate emails", () => {
    const r = parseRosterCsv("학년,반,이름,이메일\n7,1,가,a@x.kr\n3,1,,b@x.kr\n3,1,다,a@x.kr\n3,1,라,a@x.kr\n3,1,마,nope\n");
    expect(r.errors.length).toBe(4);
    expect(r.rows).toHaveLength(1);
  });
  it("handles quotes, tabs, CRLF and BOM", () => {
    expect(parseCsv('﻿"a,b",c\r\nd\te\r\n')).toEqual([["a,b", "c"], ["d", "e"]]);
  });
  it("missing header", () => {
    expect(parseRosterCsv("이름,이메일\n가,a@x.kr").errors.length).toBeGreaterThan(0);
  });
  it("ids", () => {
    expect(studentIdFor({ email: "A@x.kr", grade: 3, classNo: 1, number: 1 }, 2026)).toBe("a@x.kr");
    expect(studentIdFor({ email: "", grade: 1, classNo: 2, number: 3 }, 2026)).toBe("nomail-2026-1-2-03");
  });
});

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { buildCertificatesHwpx } from "../hwpx";
describe("hwpx certificates", () => {
  const template = new Uint8Array(readFileSync(new URL("../../public/cert/template.hwpx", import.meta.url)));
  it("fills placeholders and repeats pages", () => {
    const out = buildCertificatesHwpx(template, [
      { field: "도전! 독서 마라톤", grade: 4, classNo: 1, name: "김하주" },
      { field: "탄소중립! 환경 지킴이", grade: 5, classNo: 2, name: "이<특수>" },
    ], { date: ["2026", "12", "18"], year: 2026 });
    const files = unzipSync(out);
    expect(Object.keys(files)[0]).toBe("mimetype");
    const xml = strFromU8(files["Contents/section0.xml"]);
    expect(xml).toContain("<hp:t>김하주</hp:t>");
    expect(xml).toContain("<hp:t>이&lt;특수&gt;</hp:t>");
    expect(xml).toContain("<hp:t>4학년 1반</hp:t>");
    expect(xml).toContain("<hp:t>5학년 2반</hp:t>");
    expect(xml).toContain("<hp:t>2026년 12월 18일</hp:t>");
    expect(xml).not.toContain("{}");
    expect(xml).not.toContain("홍길동");
    expect((xml.match(/<hp:secPr\b/g) ?? []).length).toBe(1);
    expect((xml.match(/pageBreak="1"/g) ?? []).length).toBeGreaterThanOrEqual(1);
    const picIds = [...xml.matchAll(/<hp:pic\b[^>]*?\bid="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(picIds).size).toBe(picIds.length);
    mkdirSync(new URL("../../.claude-tmp/", import.meta.url), { recursive: true });
    writeFileSync(new URL("../../.claude-tmp/test-certs.hwpx", import.meta.url), out);
  });
  it("replaces school and removes seal", () => {
    const out = buildCertificatesHwpx(template, [{ field: "A", grade: 3, classNo: 1, name: "가" }], { date: ["2027", "2", "1"], schoolName: "경산초등학교", principalTitle: "경산초등학교장 홍길동", year: 2027, seal: null });
    const xml = strFromU8(unzipSync(out)["Contents/section0.xml"]);
    expect(xml).toContain("<hp:t>경산초등학교</hp:t>");
    expect(xml).toContain("<hp:t>경산초등학교장 홍길동</hp:t>");
    expect(xml).toContain("「2027 도전!");
    expect(xml).not.toContain('binaryItemIDRef="image2"');
  });
});
