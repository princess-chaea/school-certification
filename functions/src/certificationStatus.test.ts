import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateCertificationStatus, canViewCertificationStatus, certificationStatus, validateStatusInput } from "./certificationStatus.js";
import { db, type StaffDoc } from "./common.js";
import { HAJU_PROGRAMS, mergeConfig } from "./shared/domain.js";

const config = mergeConfig({ programs: HAJU_PROGRAMS });
const input = { program: "reading", year: 2026 };
const lead: StaffDoc = { role: "teacher", status: "active", certificationPrograms: ["reading"] };
const student = { active: true, year: 2026, grade: 4, classNo: 1 };

test("only active school admins or explicitly assigned certification leads can read a program", () => {
  assert.equal(canViewCertificationStatus(lead, "reading"), true);
  assert.equal(canViewCertificationStatus(lead, "english"), false);
  assert.equal(canViewCertificationStatus({ ...lead, status: "pending" }, "reading"), false);
  assert.equal(canViewCertificationStatus({ ...lead, certificationPrograms: [], homeroom: true, grade: 4, classNo: 1, programs: ["reading"], bulkRecognitionPrograms: ["reading"] }, "reading"), false);
  assert.equal(canViewCertificationStatus({ role: "admin", status: "active" }, "english"), true);
  assert.equal(canViewCertificationStatus(undefined, "reading"), false);
});

test("scope input rejects malformed years, grades and unscoped classes", () => {
  assert.deepEqual(validateStatusInput({ ...input, grade: 4, classNo: 1 }), { ...input, grade: 4, classNo: 1 });
  for (const patch of [{ year: "2026" }, { year: 2026.5 }, { program: "../reading" }, { grade: 0 }, { grade: 7 }, { classNo: 1 }, { grade: 4, classNo: 0 }, { grade: 4, classNo: 100 }]) assert.throws(() => validateStatusInput({ ...input, ...patch }));
});

test("aggregate recalculates medal tiers, excludes inactive/demo/wrong year, and returns only counts", () => {
  const rows = [
    { ...student, name: "private", email: "private@example.com", progress: { reading: { count: 40, medal: "gold" } } },
    { ...student, progress: { reading: { count: 60 } } },
    { ...student, classNo: 2, progress: { reading: { count: 80 } } },
    { ...student, grade: 3, classNo: 2 },
    { ...student, active: false }, { ...student, isDemo: true }, { ...student, year: 2025 },
  ];
  const result = aggregateCertificationStatus(config, validateStatusInput(input), rows);
  assert.deepEqual(result.totals, { students: 4, participants: 3, certified: 3, none: 1, bronze: 1, silver: 1, gold: 1 });
  assert.deepEqual(result.classes.map((c) => [c.grade, c.classNo]), [[3, 2], [4, 1], [4, 2]]);
  assert.equal(JSON.stringify(result).includes("private"), false);
  const filtered = aggregateCertificationStatus(config, validateStatusInput({ ...input, grade: 4, classNo: 1 }), rows);
  assert.equal(filtered.totals.students, 2);
});

test("task progress counts partial participation and only eligible grades", () => {
  const rows = [
    { ...student, progress: { english: { tasks: { t1: 1 } } } },
    { ...student, progress: { english: { tasks: { t1: 30, t2: 1, t3: 40, t4: 4 } } } },
    { ...student, grade: 1, progress: { english: { tasks: { t1: 30 } } } },
  ];
  const result = aggregateCertificationStatus(config, validateStatusInput({ ...input, program: "english" }), rows);
  assert.equal(result.totals.students, 2);
  assert.equal(result.totals.participants, 2);
  assert.equal(result.totals.gold, 1);
  assert.equal(result.totals.certified, 1);
});

test("callable checks server assignment, same school and current year before roster reads", async (t) => {
  const root = "schools/status-test";
  const docs = new Map<string, Record<string, unknown>>([
    [root, { status: "active", year: 2026 }], [`${root}/staff/teacher`, { ...lead }], [`${root}/config/app`, { programs: HAJU_PROGRAMS }],
  ]);
  t.mock.method(db, "doc", ((path: string) => ({ get: async () => ({ data: () => docs.get(path), get: (key: string) => docs.get(path)?.[key] }) })) as unknown as typeof db.doc);
  let reads = 0;
  t.mock.method(db, "collection", ((path: string) => {
    assert.equal(path, `${root}/students`);
    return { where: (field: string, _op: string, value: number) => {
      assert.equal(field, "year"); assert.equal(value, 2026);
      return { select: (...fields: string[]) => {
        assert.equal(fields.includes("name"), false); assert.equal(fields.includes("email"), false);
        return { get: async () => { reads++; return { docs: [{ data: () => student }] }; } };
      } };
    } };
  }) as unknown as typeof db.collection);
  const call = (data: Record<string, unknown> = {}, uid = "teacher") => certificationStatus.run({ auth: { uid }, data: { ...input, schoolId: "status-test", ...data } } as never);
  assert.equal((await call()).totals.students, 1);
  for (const data of [{ schoolId: "another-school" }, { year: 2025 }, { program: "english" }, { certificationPrograms: ["english"], program: "english" }]) await assert.rejects(call(data));
  await assert.rejects(call({}, "stranger"));
  docs.set(`${root}/staff/teacher`, { ...lead, certificationPrograms: [] });
  await assert.rejects(call());
  assert.equal(reads, 1);
});
