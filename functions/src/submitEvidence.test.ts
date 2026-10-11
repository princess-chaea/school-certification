import assert from "node:assert/strict";
import { test } from "node:test";
import { HAJU_PROGRAMS } from "./shared/domain.js";
import { evidenceContentFingerprint, photoSubmissionBlocksRetry, recentSubmissionTimes, validatedEvidence } from "./submitEvidence.js";

const reading = HAJU_PROGRAMS[0];
const input = { activityDate: "2026-10-10", photoPath: "photo.jpg", fields: { bookTitle: "책" } };
test("text and link duplicates ignore whitespace and field ordering while allowing distinct activities", () => {
  const first = { program: "journal", activityDate: "2026-10-10", text: " 오늘 실천했어요. ", link: "https://example.com/", fields: { b: "둘", a: "하나" } };
  assert.equal(evidenceContentFingerprint(first), evidenceContentFingerprint({ ...first, text: "오늘  실천했어요.", fields: { a: "하나", b: "둘", c: " " } }));
  for (const patch of [{ activityDate: "2026-10-11" }, { text: "다른 활동이에요" }, { program: "other" }, { task: "t2" }, { link: "https://example.com/other" }, { fields: { a: "다른 답" } }]) {
    assert.notEqual(evidenceContentFingerprint(first), evidenceContentFingerprint({ ...first, ...patch }));
  }
});
test("audio and file duplicates use server MD5 across upload paths, with path fallback for missing hashes", () => {
  for (const key of ["audioPath", "filePath"] as const) {
    const first = { program: "practice", activityDate: "2026-10-10", [key]: "first-upload" };
    const second = { ...first, [key]: "second-upload" };
    assert.equal(evidenceContentFingerprint(first, { [key]: "same-md5" }), evidenceContentFingerprint(second, { [key]: "same-md5" }));
    assert.notEqual(evidenceContentFingerprint(first, { [key]: "same-md5" }), evidenceContentFingerprint(second, { [key]: "different-md5" }));
    assert.notEqual(evidenceContentFingerprint(first), evidenceContentFingerprint(second));
    assert.equal(evidenceContentFingerprint(first), evidenceContentFingerprint({ ...first }));
    assert.notEqual(evidenceContentFingerprint(first, { [key]: "same-md5" }), evidenceContentFingerprint({ ...first, activityDate: "2026-10-11" }, { [key]: "same-md5" }));
  }
});
test("same photo can correct deleted or missing records, but cannot duplicate pending or approved records", () => {
  const snapshot = (exists: boolean, status?: string) => ({ exists, get: () => status });
  assert.equal(photoSubmissionBlocksRetry(snapshot(false)), false);
  assert.equal(photoSubmissionBlocksRetry(snapshot(true, "deleted")), false);
  for (const status of ["pending", "active", "approved"]) assert.equal(photoSubmissionBlocksRetry(snapshot(true, status)), true);
});
test("accepts old activity records and ignores client identity/status", () => {
  const result = validatedEvidence({ ...input, sid: "other", status: "active", count: 500 }, reading, 4, "2026-10-11");
  assert.equal(result.activityDate, "2026-10-10");
  assert.equal(result.sid, undefined);
  assert.equal(result.status, undefined);
  assert.equal(result.count, undefined);
});
test("rejects impossible dates, future dates and oversized text", () => {
  for (const activityDate of ["2026-02-30", "2026-10-12", "not-a-date"]) assert.throws(() => validatedEvidence({ ...input, activityDate }, reading, 4, "2026-10-11"));
  assert.throws(() => validatedEvidence({ ...input, text: "x".repeat(2001) }, reading, 4, "2026-10-11"));
});
test("rejects missing evidence, extra fields and disabled programs", () => {
  assert.throws(() => validatedEvidence({ ...input, photoPath: undefined }, reading, 4, "2026-10-11"));
  assert.throws(() => validatedEvidence({ ...input, fields: { admin: "true" } }, reading, 4, "2026-10-11"));
  assert.throws(() => validatedEvidence(input, { ...reading, enabled: false }, 4, "2026-10-11"));
});
test("rejects unavailable grades, sentence task submissions and invalid choices", () => {
  const english = HAJU_PROGRAMS[2];
  assert.throws(() => validatedEvidence({ ...input, task: "t2", fields: {} }, english, 1, "2026-10-11"));
  assert.throws(() => validatedEvidence({ ...input, task: "t1", fields: {} }, english, 4, "2026-10-11"));
  assert.throws(() => validatedEvidence({ ...input, fields: {}, text: "환경을 지켜요", activityType: "잘못된 종류" }, HAJU_PROGRAMS[1], 4, "2026-10-11"));
});
test("allows at least 30 first-day submissions then temporarily blocks rapid bursts", () => {
  let times: number[] = [];
  const now = 2_000_000_000;
  for (let i = 0; i < 40; i++) times = recentSubmissionTimes(times, now + i);
  assert.equal(times.length, 40);
  assert.throws(() => recentSubmissionTimes(times, now + 40), /잠시 뒤/);
  assert.equal(recentSubmissionTimes(times, now + 600_040).length, 41);
});
test("rolling hourly limit expires; no daily submission limit", () => {
  const now = 2_000_000_000;
  const times = Array.from({ length: 120 }, (_, i) => now - 3_500_000 + i * 10_000);
  assert.throws(() => recentSubmissionTimes(times, now), /잠시 뒤/);
  assert.equal(recentSubmissionTimes(times, now + 3_600_000).length, 1);
});
