import { describe, expect, it } from "vitest";
import { isCorrectAnswer, diffWords, firstLetterHint, normalizeSentence, speechMatchRatio } from "../typing";
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
