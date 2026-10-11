import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "./common.js";
import { importRoster, updateClassStudentNames } from "./admin.js";

test("name CSV callable validates every row atomically and preserves student records", async (t) => {
  const root = "schools/name-test";
  const docs = new Map<string, Record<string, unknown>>([
    [root, { year: 2026 }],
    [`${root}/staff/teacher`, { role: "teacher", status: "active", subject: true, grades: [1], subjectClasses: [{grade:1,classNo:2}] }],
    [`${root}/students/a`, { sid: "a", grade: 1, classNo: 2, number: 1, name: "", year: 2026, active: true, email: "a@x.kr", progress: { reading: { count: 30 } } }],
    [`${root}/students/b`, { sid: "b", grade: 1, classNo: 2, number: 2, name: "바다", year: 2026, active: true }],
  ]);
  const snapshot = (path: string) => ({ exists: docs.has(path), data: () => docs.get(path), get: (key: string) => docs.get(path)?.[key] });
  t.mock.method(db, "doc", ((path: string) => ({ path, get: async () => snapshot(path) })) as unknown as typeof db.doc);
  let committed = 0;
  t.mock.method(db, "runTransaction", (async (work: (tx: unknown) => Promise<unknown>) => {
    const patches: {path:string;data:Record<string,unknown>}[] = [];
    const result = await work({
      getAll: async (...refs: {path:string}[]) => { assert.equal(patches.length,0); return refs.map((ref)=>snapshot(ref.path)); },
      update: (ref: {path:string}, data: Record<string,unknown>) => { assert.deepEqual(Object.keys(data).sort(),["name","updatedAt"]); patches.push({path:ref.path,data}); },
    });
    for (const p of patches) docs.set(p.path,{...docs.get(p.path),...p.data});
    committed += patches.length;
    return result;
  }) as unknown as typeof db.runTransaction);
  const row = { sid:"a",grade:1,classNo:2,number:1,name:"하늘" };
  const call = (rows: unknown[], classNo: number|null = null) => updateClassStudentNames.run({auth:{uid:"teacher"},data:{schoolId:"name-test",grade:1,classNo,rows}} as never);
  assert.deepEqual(await call([row]), {updated:1,unchanged:0});
  assert.deepEqual(docs.get(`${root}/students/a`)?.progress,{reading:{count:30}});
  assert.equal(docs.get(`${root}/students/a`)?.email,"a@x.kr");
  assert.deepEqual(await call([row]),{updated:0,unchanged:1});
  for (const invalid of [{...row,sid:"missing"},{...row,sid:"b",number:99},{...row,sid:"b",number:2,classNo:3}]) {
    await assert.rejects(call([{...row,name:"변경안됨"},invalid]));
    assert.equal(docs.get(`${root}/students/a`)?.name,"하늘");
  }
  await assert.rejects(call([row,row]), {code:"invalid-argument"});
  await assert.rejects(call([{...row,name:""}]), {code:"invalid-argument"});
  docs.get(`${root}/students/b`)!.year = 2025;
  await assert.rejects(call([{...row,sid:"b",number:2}]),{code:"failed-precondition"});
  docs.get(`${root}/students/b`)!.year = 2026;
  docs.get(`${root}/students/b`)!.isDemo = true;
  await assert.rejects(call([{...row,sid:"b",number:2}]),{code:"failed-precondition"});
  docs.get(`${root}/students/b`)!.isDemo = false;
  delete docs.get(`${root}/students/b`)!.active;
  assert.deepEqual(await call([{...row,sid:"b",number:2,name:"바다"}]),{updated:0,unchanged:1});
  assert.equal(committed,1);
  docs.get(`${root}/staff/teacher`)!.status = "pending";
  await assert.rejects(call([row]),{code:"permission-denied"});
});

test("roster import creates unnamed account-free pupils and rejects collisions before any write", async (t) => {
  const root = "schools/roster-test";
  const docs = new Map<string, Record<string, unknown>>([
    [root,{year:2026}], [`${root}/staff/admin`,{role:"admin",status:"active"}],
    [`${root}/students/account@x.kr`,{sid:"account@x.kr",email:"account@x.kr",grade:1,classNo:1,number:1,year:2026,active:true,name:"기존",progress:{reading:{count:10}}}],
    [`${root}/students/demo-1-1-3`,{sid:"demo-1-1-3",grade:1,classNo:1,number:3,year:2026,active:true,isDemo:true}],
  ]);
  const snapshot=(path:string)=>({exists:docs.has(path),data:()=>docs.get(path),get:(key:string)=>docs.get(path)?.[key]});
  t.mock.method(db,"doc",((path:string)=>({path,get:async()=>snapshot(path)})) as unknown as typeof db.doc);
  t.mock.method(db,"collection",((path:string)=>({get:async()=>({docs:[...docs.entries()].filter(([key])=>key.startsWith(path+"/")).map(([key,data])=>({id:key.split("/").at(-1),data:()=>data}))})})) as unknown as typeof db.collection);
  let writes=0;
  t.mock.method(db,"batch",(()=>({
    set:(ref:{path:string},data:Record<string,unknown>,options?:{merge?:boolean})=>{docs.set(ref.path,options?.merge?{...docs.get(ref.path),...data}:data);writes++;},
    commit:async()=>[],
  })) as unknown as typeof db.batch);
  const row={grade:1,classNo:1,number:2,name:"",email:""};
  const call=(rows:unknown[])=>importRoster.run({auth:{uid:"admin"},data:{schoolId:"roster-test",rows}} as never);
  await assert.rejects(call([row,{...row,number:0}]),{code:"invalid-argument"});
  await assert.rejects(call([row,row]),{code:"invalid-argument"});
  await assert.rejects(call([{...row,number:1}]),{code:"failed-precondition"});
  assert.equal(writes,0);
  assert.deepEqual(await call([row]),{created:1,updated:0,deactivated:0,year:2026});
  assert.equal(docs.get(`${root}/students/nomail-2026-1-1-02`)?.name,"");
  await call([{...row,number:3}]);
  assert.equal(docs.get(`${root}/students/nomail-2026-1-1-03`)?.isDemo,undefined);
  await call([{...row,number:1,email:"account@x.kr"}]);
  assert.equal(docs.get(`${root}/students/account@x.kr`)?.name,"기존");
  assert.deepEqual(docs.get(`${root}/students/account@x.kr`)?.progress,{reading:{count:10}});
});
