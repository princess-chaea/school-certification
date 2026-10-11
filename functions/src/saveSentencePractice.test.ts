import assert from "node:assert/strict";
import { test } from "node:test";
import { getStorage } from "firebase-admin/storage";
import { db } from "./common.js";
import { HAJU_PROGRAMS } from "./shared/domain.js";
import { saveSentencePractice, sentenceChange, sentenceRequestTimes } from "./saveSentencePractice.js";

const sentence = { no: 1, en: "I like soccer.", alternatives: ["I love soccer."] };
const input = { action: "round", audioPath: "own/audio.webm", typed: "I like soccer.", attempts: 1, durationMs: 1500 };
const rounds = (count: number) => Array.from({ length: count }, (_, i) => ({ typedOk: true, audioPath: `round-${i}` }));

test("callable permits committed round replay at quota but rejects a new round without writes", async (t) => {
  const schoolId = "sentence-quota-test", email = "student@example.com", uid = "student-uid";
  const id = `2026_${email}_task1-cartoon_1`;
  const prefix = `schools/${schoolId}`;
  const audioPath = `${prefix}/uploads/${email}/english/committed.webm`;
  const freshAudio = `${prefix}/uploads/${email}/english/fresh.webm`;
  const docs: Record<string, Record<string, unknown>> = {
    [prefix]: { year: 2026, status: "active" },
    [`${prefix}/config/app`]: { programs: HAJU_PROGRAMS },
    [`${prefix}/students/${email}`]: { email, active: true, year: 2026, grade: 4, classNo: 1 },
    [`studentIndex/${email}`]: { sid: email, schoolId, year: 2026 },
    [`${prefix}/sentenceSets/task1-cartoon`]: { items: [sentence] },
    [`${prefix}/englishItems/${id}`]: { program: "english", task: "t1", status: "practicing", rounds: [{ typedOk: true, audioPath }] },
    [`${prefix}/uploadTickets/committed.webm`]: { uid, kind: "sentenceAudio", path: audioPath, consumedBy: id },
    [`${prefix}/uploadTickets/fresh.webm`]: { uid, kind: "sentenceAudio", path: freshAudio },
  };
  const snapshot = (path: string) => {
    const data = path.includes("/sentenceLimits/") ? { times: Array(40).fill(Date.now()) } : docs[path];
    return { exists: !!data, get: (key: string) => data?.[key], data: () => data };
  };
  let writes = 0;
  t.mock.method(db, "doc", (path: string) => ({ path, get: async () => snapshot(path) }));
  t.mock.method(db, "runTransaction", async (callback: (tx: unknown) => unknown) => callback({
    getAll: async (...refs: { path: string }[]) => refs.map((r) => snapshot(r.path)),
    get: async (ref: { path: string }) => snapshot(ref.path),
    set: () => { writes++; }, update: () => { writes++; },
  }));
  t.mock.method(getStorage(), "bucket", () => ({ file: () => ({ getMetadata: async () => [{ contentType: "audio/webm", size: 1000 }] }) }));
  const request = (path: string) => ({ auth: { uid, token: { email, email_verified: true } }, data: { ...input, schoolId, program: "english", task: "t1", setId: "task1-cartoon", no: 1, audioPath: path } });
  assert.deepEqual(await saveSentencePractice.run(request(audioPath) as never), { id, existing: true });
  await assert.rejects(saveSentencePractice.run(request(freshAudio) as never), (error: unknown) => (error as { code?: string }).code === "resource-exhausted");
  assert.equal(writes, 0);
});

test("bulk check requests allow all 45 configured cartoon sentences and stop sustained abuse", () => {
  let times: number[] = [];
  for (let i = 0; i < 45; i++) times = sentenceRequestTimes(times, 1_000_000 + i);
  assert.equal(times.length, 45);
  assert.throws(() => sentenceRequestTimes(Array(150).fill(1_000_000), 1_000_001));
  assert.deepEqual(sentenceRequestTimes(Array(150).fill(1), 1_000_000), [1_000_000]);
});

test("server derives completion after three valid rounds and ignores forged status and rounds", () => {
  const first = sentenceChange({ ...input, status: "checked", rounds: rounds(99), sid: "victim" }, sentence, {}, 100)!;
  assert.equal(first.status, "practicing");
  assert.equal(first.sid, undefined);
  assert.equal((first.rounds as unknown[]).length, 1);
  assert.equal(sentenceChange(input, sentence, { status: "practicing", rounds: rounds(2) }, 100)?.status, "ready");
});
test("same recording is an idempotent no-op including after teacher check", () => {
  for (const status of ["practicing", "ready", "requested", "checked", "retry"]) {
    assert.equal(sentenceChange(input, sentence, { status, rounds: [{ typedOk: true, audioPath: input.audioPath }] }, 100), null);
  }
});
test("blocks excess rounds and writes while ready, requested or checked", () => {
  for (const status of ["ready", "requested", "checked"]) assert.throws(() => sentenceChange(input, sentence, { status }, 100));
  assert.throws(() => sentenceChange(input, sentence, { status: "practicing", rounds: rounds(3) }, 100));
});
test("teacher retry permits one new round, preserves history and bounds document growth", () => {
  const result = sentenceChange(input, sentence, { status: "retry", rounds: rounds(19) }, 100)!;
  assert.equal(result.status, "ready");
  assert.equal((result.rounds as unknown[]).length, 20);
  assert.deepEqual((result.rounds as unknown[])[0], rounds(1)[0]);
  assert.throws(() => sentenceChange(input, sentence, { status: "retry", rounds: rounds(20) }, 100));
});
test("requires correct text using shared alternatives and valid round measurements", () => {
  assert.equal(sentenceChange({ ...input, typed: "I love soccer." }, sentence, {}, 100)?.status, "practicing");
  for (const patch of [{ typed: "wrong" }, { typed: "x".repeat(501) }, { durationMs: 999 }, { durationMs: Infinity }, { durationMs: 35_001 }, { attempts: 0 }, { attempts: 1.5 }, { attempts: 1001 }, { sttText: "x".repeat(1001) }]) {
    assert.throws(() => sentenceChange({ ...input, ...patch }, sentence, {}, 100));
  }
});
test("custom text is only created for student-defined slots, immutable and idempotent", () => {
  const data = { action: "custom", en: "My sentence.", ko: "내 문장" };
  const slot = { no: 1, type: "student", en: "" };
  assert.throws(() => sentenceChange(data, sentence, {}, 100));
  const result = sentenceChange(data, slot, {}, 100)!;
  assert.equal(result.status, "practicing");
  const custom = { en: data.en, ko: data.ko };
  assert.equal(sentenceChange(data, slot, { custom }, 100), null);
  assert.throws(() => sentenceChange({ ...data, en: "Changed sentence." }, slot, { custom }, 100));
  assert.throws(() => sentenceChange({ ...data, en: "one" }, slot, {}, 100));
  assert.throws(() => sentenceChange(input, slot, {}, 100));
});
test("request requires server ready state and three rounds, repeats are no-ops", () => {
  const data = { action: "request" };
  for (const status of ["new", "practicing", "retry"]) assert.throws(() => sentenceChange(data, sentence, { status, rounds: rounds(3) }, 100));
  assert.throws(() => sentenceChange(data, sentence, { status: "ready", rounds: rounds(2) }, 100));
  assert.equal(sentenceChange(data, sentence, { status: "ready", rounds: rounds(3) }, 100)?.status, "requested");
  assert.equal(sentenceChange(data, sentence, { status: "requested" }, 100), null);
  assert.equal(sentenceChange(data, sentence, { status: "checked" }, 100), null);
  assert.throws(() => sentenceChange({ action: "check" }, sentence, {}, 100));
});
