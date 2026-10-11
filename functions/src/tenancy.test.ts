import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { CallableRequest } from "firebase-functions/v2/https";
import { db } from "./common.js";
import { requestJoin } from "./tenancy.js";

const schoolPath = "schools/7000001";
const school = { status: "active", joinPolicy: "open", createdBy: "founder" };
type Document = Record<string, unknown>;

// No network or real Firestore writes. Serial commits model the fresh reads that
// Firestore performs when a competing transaction is retried after school creation.
function fixture(t: TestContext, initial: Record<string, Document> = {}) {
  const documents = new Map(Object.entries(initial));
  let missingSchoolPreflights = 0;
  let queue = Promise.resolve();
  const snapshot = (path: string) => {
    const value = documents.get(path);
    return { exists: value !== undefined, get: (key: string) => value?.[key] };
  };
  const doc = (path: string) => ({ path, get: async () => {
    if (path === schoolPath && !documents.has(path)) missingSchoolPreflights++;
    return snapshot(path);
  } });
  t.mock.method(db, "doc", doc as unknown as typeof db.doc);
  const runTransaction = async (body: (tx: unknown) => Promise<unknown>) => {
    const result = queue.then(async () => {
      const writes: (() => void)[] = [];
      const tx = {
        get: async (ref: { path: string }) => snapshot(ref.path),
        create: (ref: { path: string }, value: Document) => writes.push(() => {
          assert.equal(documents.has(ref.path), false, "school may only be created once");
          documents.set(ref.path, value);
        }),
        set: (ref: { path: string }, value: Document) => writes.push(() => {
          documents.set(ref.path, { ...documents.get(ref.path), ...value });
        }),
      };
      const value = await body(tx);
      writes.forEach((write) => write());
      return value;
    });
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  t.mock.method(db, "runTransaction", runTransaction as unknown as typeof db.runTransaction);
  const previous = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.FUNCTIONS_EMULATOR;
    else process.env.FUNCTIONS_EMULATOR = previous;
  });
  return { documents, missingSchoolPreflights: () => missingSchoolPreflights };
}

function join(uid: string, admin = false, overrides: Record<string, unknown> = {}) {
  return requestJoin.run({
    auth: { uid, token: { email: `${uid}@example.com`, email_verified: true, firebase: { sign_in_provider: "google.com" } } },
    data: {
      neis: { schoolCode: "7000001", name: "하주초등학교", atptCode: "R10" },
      name: uid, admin, homeroom: { grade: 4, classNo: 1 }, ...overrides,
    },
  } as unknown as CallableRequest);
}

test("the first teacher creating a school becomes active admin without requesting admin", async (t) => {
  const { documents } = fixture(t);
  assert.deepEqual(await join("founder"), { status: "active", schoolId: "7000001", created: true });
  assert.equal(documents.get(schoolPath)?.createdBy, "founder");
  assert.equal(documents.get(schoolPath)?.joinPolicy, "open");
  assert.equal(documents.get(`${schoolPath}/staff/founder`)?.role, "admin");
});

test("two requests observing an unopened school grant admin only to the transaction that creates it", async (t) => {
  const { documents, missingSchoolPreflights } = fixture(t);
  const results = await Promise.all([join("first", true), join("second", true)]);
  assert.equal(missingSchoolPreflights(), 2, "both callers initially saw the school as unopened");
  assert.equal(results.filter((result) => result.created).length, 1);
  const creator = documents.get(schoolPath)?.createdBy;
  for (const uid of ["first", "second"]) {
    assert.equal(documents.get(`${schoolPath}/staff/${uid}`)?.role, uid === creator ? "admin" : "teacher");
    assert.equal(documents.get(`${schoolPath}/staff/${uid}`)?.status, "active");
  }
});

test("an active administrator retains admin on rejoin after approval-only signup is enabled", async (t) => {
  const { documents } = fixture(t, {
    [schoolPath]: { ...school, joinPolicy: "approval" },
    "users/founder": { schoolId: "7000001" },
    [`${schoolPath}/staff/founder`]: { role: "admin", status: "active" },
  });
  assert.deepEqual(await join("founder"), { status: "active", schoolId: "7000001", created: false });
  assert.equal(documents.get(`${schoolPath}/staff/founder`)?.role, "admin");
});

test("a rejected account cannot bypass rejection through open signup or requesting admin", async (t) => {
  const { documents } = fixture(t, {
    [schoolPath]: school,
    [`${schoolPath}/staff/rejected`]: { role: "teacher", status: "rejected" },
  });
  const before = structuredClone([...documents]);
  await assert.rejects(join("rejected", true), { code: "permission-denied" });
  assert.deepEqual([...documents], before, "rejection must not change school, staff, or user records");
});

test("approval-only signup leaves later teachers pending even when they request admin", async (t) => {
  const { documents } = fixture(t, { [schoolPath]: { ...school, joinPolicy: "approval" } });
  assert.deepEqual(await join("later", true), { status: "pending", schoolId: "7000001", created: false });
  assert.equal(documents.get(`${schoolPath}/staff/later`)?.role, "teacher");
});

test("rejoining cannot widen granted teacher assignments or replace administrator-managed staff data", async (t) => {
  const path = `${schoolPath}/staff/granted`;
  const existing = { role: "teacher", status: "active", name: "담당 교사", homeroom: true, grade: 4, classNo: 1, subject: true, grades: [4], programs: ["reading"], bulkRecognitionPrograms: ["reading"], createdAt: "original" };
  const { documents } = fixture(t, { [schoolPath]: school, [path]: existing });
  assert.deepEqual(await join("granted", true, { homeroom: { grade: 6, classNo: 3 }, subject: { grades: [1,2,3,4,5,6], programs: ["reading", "english", "carbon"] } }), { status: "active", schoolId: "7000001", created: false });
  assert.deepEqual(documents.get(path), existing);
  assert.equal(documents.get("users/granted")?.schoolId, "7000001");
});

test("active teachers without bulk grants also retain their administrator-managed assignments on rejoin", async (t) => {
  const path = `${schoolPath}/staff/assigned`;
  const existing = { role: "teacher", status: "active", homeroom: true, grade: 2, classNo: 3, name: "담임" };
  const { documents } = fixture(t, { [schoolPath]: school, [path]: existing });
  await join("assigned", true);
  assert.deepEqual(documents.get(path), existing);
});

test("pending teacher with retained bulk grants cannot use open signup to activate and widen scope", async (t) => {
  const path = `${schoolPath}/staff/pending`;
  const existing = { role: "teacher", status: "pending", grade: 2, classNo: 1, homeroom: true, bulkRecognitionPrograms: ["reading"] };
  const { documents } = fixture(t, { [schoolPath]: school, [path]: existing });
  assert.deepEqual(await join("pending"), {status:"pending",schoolId:"7000001",created:false});
  assert.deepEqual(documents.get(path), existing);
});
