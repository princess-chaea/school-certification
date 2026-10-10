import { describe, expect, it } from "vitest";
import { isCorrectAnswer, diffWords, firstLetterHint, normalizeSentence, speechMatchRatio } from "../typing";
import { parseNeisSchoolInfo, neisResultMessage, shortSchoolName, mergeSchool, principalTitle } from "../school";
import { thresholdsFor, medalFor, HAJU_PROGRAMS, DEFAULT_CONFIG as BASE_CONFIG, computeProgress, nextStep, validateEvidence, withCertifiedDates } from "../domain";
import { PROGRAM_TEMPLATES } from "../templates";
import { ICONS, PALETTE } from "../../src/components/pixelArt";
import { ICON_GROUPS, ACTIVITY_ICONS } from "../../src/components/pixelArtActivities";
import task1 from "../../data/english/task1-cartoon.json";
import g4 from "../../data/english/task3-grade4.json";
import g5 from "../../data/english/task3-grade5.json";
import g6 from "../../data/english/task3-grade6.json";

const DEFAULT_CONFIG = { ...BASE_CONFIG, programs: HAJU_PROGRAMS };

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
  const P = (id: string) => DEFAULT_CONFIG.programs.find((p) => p.id === id)!;
  it("bronze equals the plan criterion", () => {
    expect(thresholdsFor(DEFAULT_CONFIG, P("reading"), 3)).toEqual({ bronze: 40, silver: 60, gold: 80 });
    expect(thresholdsFor(DEFAULT_CONFIG, P("reading"), 2)).toEqual({ bronze: 50, silver: 75, gold: 100 });
    const t = thresholdsFor(DEFAULT_CONFIG, P("carbon"), 5)!;
    expect(t).toEqual({ bronze: 20, silver: 30, gold: 40 });
    expect(medalFor(19, t)).toBe("none");
    expect(medalFor(20, t)).toBe("bronze");
    expect(medalFor(40, t)).toBe("gold");
    expect(nextStep(12, t)).toEqual({ medal: "bronze", remaining: 8 });
    expect(nextStep(45, t)).toBeNull();
  });
  it("task programs count completed tasks", () => {
    const g = (c: Record<string, number>) => computeProgress(DEFAULT_CONFIG, 5, { english: c }).english;
    expect(g({ t1: 30, t2: 1, t3: 10, t4: 0 }).medal).toBe("bronze");
    expect(g({ t1: 29, t2: 1, t3: 40, t4: 4 }).medal).toBe("silver");
    expect(g({ t1: 30, t2: 1, t3: 40, t4: 4 }).medal).toBe("gold");
    expect(g({ t1: 99 }).tasks?.t1).toBe(30);
  });
  it("programs only for their grades", () => {
    expect(computeProgress(DEFAULT_CONFIG, 3, {}).english).toBeUndefined();
    expect(computeProgress(DEFAULT_CONFIG, 4, {}).english?.medal).toBe("none");
    expect(computeProgress(DEFAULT_CONFIG, 4, { reading: 41 }).reading?.medal).toBe("bronze");
  });
  it("validates evidence", () => {
    const carbon = P("carbon");
    expect(validateEvidence(carbon, {})).toBe("사진을 넣어 주세요");
    expect(validateEvidence(carbon, { photo: true, text: "좋아요 정말", choice: "플로깅" })).toBeNull();
    expect(validateEvidence(carbon, { photo: true, text: "좋", choice: "플로깅" })).toMatch(/자 이상/);
    expect(validateEvidence(carbon, { photo: true, text: "좋아요 좋아요" })).toBe("활동 종류를 골라 주세요");
    const t4 = P("english").tasks!.find((t) => t.id === "t4")!;
    expect(validateEvidence({ ...t4, evidence: t4.evidence!, required: t4.required! }, { audioSec: 60, fields: { bookTitle: "x" } })).toMatch(/분 이상/);
  });
  it("templates are valid programs", () => {
    expect(PROGRAM_TEMPLATES.length).toBeGreaterThanOrEqual(25);
    const ids = new Set<string>();
    for (const t of PROGRAM_TEMPLATES) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      expect(t.required.every((r) => t.evidence.includes(r))).toBe(true);
      expect(Object.keys(t.targetByGrade).length).toBe(t.grades.length);
      expect(ICONS[t.icon]).toBeTruthy();
    }
  });
});

describe("certified date", () => {
  const t = { bronze: 1, silver: 2, gold: 3 };
  it("keeps the first day a program was certified, sets today when newly certified, clears when lost", () => {
    const prev = { a: { count: 2, medal: "silver" as const, thresholds: t, certifiedAt: "2026-05-01" }, c: { count: 1, medal: "bronze" as const, thresholds: t, certifiedAt: "2026-04-01" } };
    const next = { a: { count: 3, medal: "gold" as const, thresholds: t }, b: { count: 1, medal: "bronze" as const, thresholds: t }, c: { count: 0, medal: "none" as const, thresholds: t } };
    const out = withCertifiedDates(next, prev, "2026-06-10");
    expect(out.a.certifiedAt).toBe("2026-05-01");
    expect(out.b.certifiedAt).toBe("2026-06-10");
    expect(out.c.certifiedAt).toBeUndefined();
  });
});

describe("pixel icons", () => {
  it("every icon is 16x16 using palette colours", () => {
    for (const [name, rows] of Object.entries(ICONS)) {
      expect(rows.length, name).toBe(16);
      for (const row of rows) {
        expect(row.length, name).toBe(16);
        for (const ch of row) expect(ch === "." || ch in PALETTE, `${name}: ${ch}`).toBe(true);
      }
    }
  });
  it("50 activity icons, none replacing a built-in icon", async () => {
    const { readFileSync } = await import("node:fs");
    const base = readFileSync(new URL("../../src/components/pixelArt.ts", import.meta.url), "utf8");
    const builtIn = [...base.matchAll(/^  (\w+): \[$/gm)].map((m) => m[1]);
    expect(Object.keys(ACTIVITY_ICONS)).toHaveLength(50);
    expect(Object.keys(ACTIVITY_ICONS).filter((n) => builtIn.includes(n))).toEqual([]);
  });
  it("picker groups only list existing icons, every activity icon included", () => {
    const names = ICON_GROUPS.flatMap((g) => g.icons.map(([n]) => n));
    expect(names.filter((n) => !ICONS[n])).toEqual([]);
    expect(new Set(names).size).toBe(names.length);
    expect(Object.keys(ACTIVITY_ICONS).filter((n) => !names.includes(n))).toEqual([]);
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
    const r = parseRosterCsv("학년,반,이름,이메일\n7,1,가,a@x.kr\n3,1,,\n3,1,다,a@x.kr\n3,1,라,a@x.kr\n3,1,마,nope\n");
    expect(r.errors.length).toBe(4);
    expect(r.rows).toHaveLength(1);
  });
  it("name is optional for students with an account (they enter it at first login)", () => {
    const r = parseRosterCsv("학년,반,번호,이름,이메일\n3,1,1,,b@x.kr\n3,1,2,가나,c@x.kr\n");
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ name: "", email: "b@x.kr", number: 1 });
    const noNameCol = parseRosterCsv("학년,반,이메일\n3,1,b@x.kr\n3,1,a@x.kr\n");
    expect(noNameCol.errors).toEqual([]);
    expect(noNameCol.rows.map((x) => [x.email, x.number])).toEqual([["b@x.kr", 2], ["a@x.kr", 1]]);
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
import { buildCertificatesHwpx, imageSize } from "../hwpx";
describe("hwpx certificates", () => {
  const template = new Uint8Array(readFileSync(new URL("../../public/cert/template.hwpx", import.meta.url)));
  const plain = new Uint8Array(readFileSync(new URL("../../public/cert/template-plain.hwpx", import.meta.url)));
  const opt = { date: ["2026", "12", "18"] as [string, string, string], year: 2026, schoolName: "하주초등학교", principalTitle: "하주초등학교장 문석주" };
  it("fills placeholders and repeats pages", () => {
    const out = buildCertificatesHwpx(template, [
      { field: "도전! 독서 마라톤", grade: 4, classNo: 1, name: "김하주" },
      { field: "탄소중립! 환경 지킴이", grade: 5, classNo: 2, name: "이<특수>" },
    ], opt);
    const files = unzipSync(out);
    expect(Object.keys(files)[0]).toBe("mimetype");
    const xml = strFromU8(files["Contents/section0.xml"]);
    expect(xml).toContain("<hp:t>김하주</hp:t>");
    expect(xml).toContain("<hp:t>이&lt;특수&gt;</hp:t>");
    expect(xml).toContain("<hp:t>하주초등학교</hp:t>");
    expect(xml).toContain("<hp:t>4학년 1반</hp:t>");
    expect(xml).toContain("<hp:t>5학년 2반</hp:t>");
    expect(xml).toContain("<hp:t>2026년 12월 18일</hp:t>");
    expect(xml).toContain("<hp:t>하주초등학교장 문석주</hp:t>");
    expect(xml).not.toMatch(/\{[^}]*\}/);
    expect(xml).not.toContain("schoolseal");
    expect((xml.match(/<hp:secPr\b/g) ?? []).length).toBe(1);
    expect((xml.match(/pageBreak="1"/g) ?? []).length).toBeGreaterThanOrEqual(1);
    const picIds = [...xml.matchAll(/<hp:pic\b[^>]*?\bid="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(picIds).size).toBe(picIds.length);
  });
  it("borderless template + seal over the last character of the principal name", () => {
    // 1x1 PNG 머리만 있으면 크기를 읽을 수 있음 (가로 200, 세로 200)
    const png = new Uint8Array(33);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 200, 0, 0, 0, 200]);
    expect(imageSize(png)).toEqual({ w: 200, h: 200 });
    const out = buildCertificatesHwpx(plain, [{ field: "A", grade: 3, classNo: 1, name: "가" }, { field: "B", grade: 3, classNo: 2, name: "나" }],
      { ...opt, date: ["2027", "2", "1"], schoolName: "경산초등학교", principalTitle: "경산초등학교장 홍길동", year: 2027, seal: { data: png, type: "image/png" } });
    const files = unzipSync(out);
    const xml = strFromU8(files["Contents/section0.xml"]);
    expect(files["BinData/schoolseal.png"]).toBeTruthy();
    expect(strFromU8(files["Contents/content.hpf"])).toContain('id="schoolseal" href="BinData/schoolseal.png" media-type="image/png"');
    expect(xml).not.toContain("image1");
    expect(xml).toContain("<hp:t>경산초등학교장 홍길동</hp:t>");
    expect(xml).toContain("「2027 도전!");
    expect((xml.match(/binaryItemIDRef="schoolseal"/g) ?? []).length).toBe(2);
    // 직인 가운데 ≈ 마지막 글자(동) 가운데: 글자 폭 2295, 가운데 정렬, 본문 폭 46604
    const m = /horzOffset="(\d+)"[^>]*\/>\s*<hp:outMargin[^>]*\/><hp:shapeComment>학교 직인/.exec(xml);
    const x = Number(m?.[1]);
    const textW = 10 * 2295 + 945;
    const lastCenter = (46604 - textW) / 2 + textW - 2295 / 2;
    expect(Math.abs(x + (24 * 283.465) / 2 - lastCenter)).toBeLessThan(5);
    const picIds = [...xml.matchAll(/<hp:pic\b[^>]*?\bid="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(picIds).size).toBe(picIds.length);
    mkdirSync(new URL("../../.claude-tmp/", import.meta.url), { recursive: true });
    writeFileSync(new URL("../../.claude-tmp/test-certs-plain.hwpx", import.meta.url), out);
  });
});
