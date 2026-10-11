import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "./common.js";
import { manageStaff } from "./manageStaff.js";

test("membership mutations protect the last active admin and authorize against transactional state", async (t) => {
  const root = "schools/staff-test";
  const docs = new Map<string, Record<string, unknown>>();
  const put = (id: string, role = "admin", status = "active") => docs.set(`${root}/staff/${id}`, { role, status });
  const snap = (path: string) => ({ id: path.split("/").at(-1), exists: docs.has(path), get: (key: string) => docs.get(path)?.[key] });
  t.mock.method(db, "doc", ((path: string) => ({ path })) as unknown as typeof db.doc);
  t.mock.method(db, "collection", ((path: string) => ({ where: (field: string, op: string, value: string) => {
    assert.deepEqual([path, field, op, value], [`${root}/staff`, "role", "==", "admin"]);
    return { query: true };
  } })) as unknown as typeof db.collection);
  let transactions = 0;
  t.mock.method(db, "runTransaction", (async (work: (tx: unknown) => Promise<unknown>) => {
    transactions++;
    const reads: string[] = [];
    const writes: (() => void)[] = [];
    const result = await work({
      get: async (ref: { path?: string; query?: boolean }) => {
        assert.equal(writes.length, 0, "all reads precede writes");
        if (ref.query) return { docs: [...docs.keys()].filter((path) => path.startsWith(`${root}/staff/`) && docs.get(path)?.role === "admin").map(snap) };
        reads.push(ref.path!); return snap(ref.path!);
      },
      update: (ref: { path: string }, patch: object) => writes.push(() => docs.set(ref.path, { ...docs.get(ref.path), ...patch })),
      delete: (ref: { path: string }) => writes.push(() => docs.delete(ref.path)),
      set: (ref: { path: string }, data: Record<string, unknown>) => {
        assert.equal(ref.path, `${root}/_internal/staffManagement`);
        assert.equal(reads[0], ref.path, "every mutation locks the same school document");
        writes.push(() => docs.set(ref.path, data));
      },
    });
    for (const write of writes) write();
    return result;
  }) as typeof db.runTransaction);
  const call = (staffId: string, action: string, value?: string, uid = "a") => manageStaff.run({ auth: { uid }, data: { schoolId: "staff-test", staffId, action, value } } as never);
  put("a"); put("pending", "admin", "pending"); put("teacher", "teacher");
  for (const [action, value] of [["delete", undefined], ["role", "teacher"], ["status", "rejected"], ["status", "pending"]]) {
    await assert.rejects(call("a", action!, value), { code: "failed-precondition" });
    assert.equal(docs.get(`${root}/staff/a`)?.role, "admin");
  }
  await assert.rejects(call("a", "delete", undefined, "teacher"), { code: "permission-denied" });
  await assert.rejects(call("a", "delete", undefined, "pending"), { code: "permission-denied" });
  await assert.rejects(call("a", "delete", undefined, "outsider"), { code: "permission-denied" });
  await call("teacher", "role", "admin");
  await call("a", "role", "teacher");
  // A second request after another administrator is removed must re-check the remaining admin.
  await assert.rejects(call("teacher", "delete", undefined, "teacher"), { code: "failed-precondition" });
  await assert.rejects(call("teacher", "status", "rejected", "a"), { code: "permission-denied" });
  await call("pending", "status", "active", "teacher");
  await call("teacher", "delete", undefined, "pending");
  assert.equal(docs.has(`${root}/staff/teacher`), false);
  docs.set("superAdmins/operator", {});
  await assert.rejects(call("pending", "delete", undefined, "operator"), { code: "failed-precondition" });
  await call("a", "role", "admin", "operator");
  await call("pending", "status", "rejected", "operator");
  assert.equal(docs.get(`${root}/staff/pending`)?.status, "rejected");
  await call("pending", "status", "active", "operator");
  await assert.rejects(call("absent", "delete", undefined, "pending"), { code: "not-found" });
  const before = transactions;
  for (const args of [["../x", "delete"], ["a", "role", "owner"], ["a", "status", "wrong"], ["a", "unknown"]]) {
    await assert.rejects(call(args[0], args[1], args[2]), { code: "invalid-argument" });
  }
  assert.equal(transactions, before);
  await assert.rejects(manageStaff.run({ data: {} } as never), { code: "unauthenticated" });
});
