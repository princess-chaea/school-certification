process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
const { initializeApp } = await import("../functions/node_modules/firebase-admin/lib/app/index.js");
const { getFirestore } = await import("../functions/node_modules/firebase-admin/lib/firestore/index.js");
initializeApp({ projectId: "demo-haju" });
const db = getFirestore();
for (const g of [4, 5, 6]) await db.doc(`sentenceSets/task3-g${g}`).delete();
for (const f of ["task1-cartoon", "task3-grade4", "task3-grade5", "task3-grade6"]) {
  const d = (await import(`../data/english/${f}.json`, { with: { type: "json" } })).default;
  await db.doc(`sentenceSets/${d.setId}`).set(d);
}
console.log("sets fixed");
