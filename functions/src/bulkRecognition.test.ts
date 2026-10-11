import assert from "node:assert/strict";
import { test } from "node:test";
import { bulkRecognize, bulkFingerprint, canBulkRecognize, existingBulkOperation, validateBulkInput, validateBulkStudent } from "./bulkRecognition.js";
import { combineSentenceCredits } from "./progress.js";
import { HAJU_PROGRAMS, computeProgress, mergeConfig } from "./shared/domain.js";
import { db, type StaffDoc } from "./common.js";
const base = { program: "reading", studentIds: ["a@school.kr"], count: 30, activityDate: "2026-10-11", recognitionMode: "offline", requestId: "request_123" };
const staff: StaffDoc = { role: "teacher", status: "active", homeroom: true, grade: 4, classNo: 1, bulkRecognitionPrograms: ["reading", "english"] };
const student = { year: 2026, active: true, grade: 4, classNo: 1 };
test("accepts historical counts while rejecting malformed and oversized operations", () => {
  assert.equal(validateBulkInput(base).count, 30);
  for (const patch of [{ count: 0 }, { count: -1 }, { count: 101 }, { count: 1.5 }, { count: "1" }, { studentIds: [] }, { studentIds: ["a", "a"] }, { studentIds: Array.from({length:201}, (_, i)=>String(i)) }, { studentIds: ["a/b"] }, { activityDate: "2026-02-30" }, { memo: "x".repeat(301) }, { recognitionMode: "forged" }, { requestId: "../oops" }]) assert.throws(() => validateBulkInput({ ...base, ...patch }));
});
test("capability and matching classroom or subject assignment are both required", () => {
  assert.equal(canBulkRecognize(staff, 4, 1, "reading"), true);
  assert.equal(canBulkRecognize(staff, 4, 2, "reading"), false);
  assert.equal(canBulkRecognize(staff, 4, 1, "carbon"), false);
  assert.equal(canBulkRecognize({ ...staff, bulkRecognitionPrograms: [] }, 4, 1, "reading"), false);
  assert.equal(canBulkRecognize({ ...staff, status: "pending" }, 4, 1, "reading"), false);
  const subject: StaffDoc = { role: "teacher", status: "active", subject: true, grades: [4], programs: ["english"], bulkRecognitionPrograms: ["english"] };
  assert.equal(canBulkRecognize(subject, 4, 2, "english"), true);
  assert.equal(canBulkRecognize(subject, 5, 2, "english"), false);
  assert.equal(canBulkRecognize(subject, 4, 2, "reading"), false);
  assert.equal(canBulkRecognize({ role: "admin", status: "active" }, 4, 2, "reading"), true);
});
test("validates roster year, grade, active flag, configured program and school-year dates", () => {
  const input = validateBulkInput(base);
  const program = HAJU_PROGRAMS[0];
  validateBulkStudent(input, program, student, staff, 2026, "2026-10-11");
  for (const patch of [{ active: false }, { year: 2025 }, { grade: 7 }, { classNo: 0 }, { classNo: 2 }]) assert.throws(() => validateBulkStudent(input, program, {...student, ...patch}, staff, 2026, "2026-10-11"));
  for (const activityDate of ["2026-02-28", "2026-10-12", "2027-03-01"]) assert.throws(() => validateBulkStudent({...input, activityDate}, program, student, staff, 2026, "2026-10-11"));
  assert.throws(() => validateBulkStudent(input, {...program, enabled: false}, student, staff, 2026, "2026-10-11"));
  assert.throws(() => validateBulkStudent(input, {...program, grades: [1]}, student, staff, 2026, "2026-10-11"));
});

test("subject class restrictions intersect grades and programs while legacy empty scope stays grade-wide", () => {
  const subject: StaffDoc = { role: "teacher", status: "active", subject: true, grades: [4], programs: ["english"], bulkRecognitionPrograms: ["english"], subjectClasses: [{ grade: 4, classNo: 2 }, { grade: 5, classNo: 1 }] };
  assert.equal(canBulkRecognize(subject, 4, 2, "english"), true);
  assert.equal(canBulkRecognize(subject, 4, 1, "english"), false);
  assert.equal(canBulkRecognize(subject, 5, 1, "english"), false);
  assert.equal(canBulkRecognize(subject, 4, 2, "reading"), false);
  assert.equal(canBulkRecognize({ ...subject, subjectClasses: [] }, 4, 1, "english"), true);
  assert.equal(canBulkRecognize({ ...subject, subjectClasses: undefined }, 4, 1, "english"), true);
  assert.equal(canBulkRecognize({ ...subject, subjectClasses: null } as unknown as StaffDoc, 4, 2, "english"), false);
  assert.equal(canBulkRecognize({ ...subject, subjectClasses: [null, { grade: 4, classNo: 2, extra: true }] } as unknown as StaffDoc, 4, 2, "english"), false);
  assert.equal(canBulkRecognize({ ...subject, homeroom: true, grade: 4, classNo: 1 }, 4, 1, "english"), true);
  assert.equal(canBulkRecognize({ ...subject, role: "admin" }, 6, 5, "reading"), true);
});
test("English permits sentence and evidence subtasks, and requires exact configured subtask", () => {
  for (const task of ["t1", "t2", "t3", "t4"]) validateBulkStudent(validateBulkInput({...base, program:"english", task}), HAJU_PROGRAMS[2], student, staff, 2026, "2026-10-11");
  for (const task of [undefined, "fake"]) assert.throws(() => validateBulkStudent(validateBulkInput({...base, program:"english", task}), HAJU_PROGRAMS[2], student, staff, 2026, "2026-10-11"));
  assert.throws(() => validateBulkStudent(validateBulkInput({...base, task:"t1"}), HAJU_PROGRAMS[0], student, staff, 2026, "2026-10-11"));
});
test("same request payload is idempotent and conflicting payload cannot reuse request", () => {
  const input = validateBulkInput({...base, studentIds:["b", "a"]});
  const hash = bulkFingerprint(input, 2026);
  assert.equal(hash, bulkFingerprint({...input, studentIds:["a", "b"]}, 2026));
  assert.equal(existingBulkOperation(undefined, hash), undefined);
  assert.equal(existingBulkOperation({fingerprint:hash,count:2}, hash), 2);
  for (const patch of [{count:31}, {memo:"different"}, {task:"new"}, {activityDate:"2026-10-10"}, {studentIds:["c"]}]) assert.throws(() => existingBulkOperation({fingerprint:hash,count:2}, bulkFingerprint({...input,...patch}, 2026)));
  assert.notEqual(hash, bulkFingerprint(input, 2027));
});
test("sentence progress includes online checked sentences and offline recognized counts", () => {
  assert.equal(combineSentenceCredits(12, 18), 30);
  assert.equal(combineSentenceCredits(0, 40), 40);
  assert.equal(combineSentenceCredits(12, 0), 12);
  const progress = computeProgress(mergeConfig({programs: HAJU_PROGRAMS}), 4, {english: {t1: combineSentenceCredits(12, 18), t2: 1, t3: 0, t4: 0}});
  assert.equal(progress.english.count, 2);
  assert.equal(progress.english.medal, "bronze");
  assert.equal(progress.english.tasks?.t1, 30);
});


test("callable commits once, replays safely, and refuses revoked or mixed-scope requests before any write", async (t) => {
  const root = "schools/bulk-test";
  const docs = new Map<string, Record<string, unknown>>([
    [root, {status:"active",year:2026}], [`${root}/staff/teacher`, {...staff}],
    [`${root}/config/app`, {programs: HAJU_PROGRAMS}],
    [`${root}/students/a@school.kr`, {...student}], [`${root}/students/outside`, {...student,classNo:2}],
  ]);
  const snapshot = (path: string) => ({ id: path.split("/").at(-1), exists: docs.has(path), data:()=>docs.get(path), get:(key:string)=>docs.get(path)?.[key] });
  let writes = 0;
  t.mock.method(db, "doc", ((path:string)=>({path})) as unknown as typeof db.doc);
  t.mock.method(db, "runTransaction", (async (body:(tx:unknown)=>Promise<unknown>)=> {
    const pending: {path:string;data:Record<string,unknown>}[] = [];
    const result = await body({
      getAll: async (...refs:{path:string}[])=>refs.map((ref)=>snapshot(ref.path)),
      create: (ref:{path:string}, data:Record<string,unknown>)=>pending.push({path:ref.path,data}),
    });
    for (const item of pending) { assert.equal(docs.has(item.path),false); docs.set(item.path,item.data); writes++; }
    return result;
  }) as unknown as typeof db.runTransaction);
  const call = (patch:Record<string,unknown>={})=>bulkRecognize.run({auth:{uid:"teacher"},data:{...base,schoolId:"bulk-test",...patch}} as never);
  assert.deepEqual(await call(),{count:1,existing:false});
  assert.equal(writes,2);
  assert.deepEqual(await call(),{count:1,existing:true});
  await assert.rejects(call({count:31}), (e:unknown)=>(e as {code:string}).code === "already-exists");
  await assert.rejects(call({requestId:"different_1",studentIds:["a@school.kr","outside"]}));
  assert.equal(writes,2);
  const saved = [...docs.entries()].find(([path])=>path.includes("/submissions/"))?.[1];
  assert.equal(saved?.source,"teacher");
  assert.equal(saved?.status,"active");
  assert.equal(saved?.count,30);
  assert.equal(saved?.recognitionMode,"offline");
  docs.set(`${root}/staff/teacher`,{...staff,bulkRecognitionPrograms:[]});
  await assert.rejects(call({requestId:"different_2"}), (e:unknown)=>(e as {code:string}).code === "permission-denied");
  assert.equal(writes,2);
});
