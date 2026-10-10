// 에뮬레이터용 테스트 계정·데이터 생성: node scripts/emulator-seed.mjs
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
const PROJECT = "demo-haju";
const { initializeApp } = await import("../functions/node_modules/firebase-admin/lib/app/index.js");
const { getAuth } = await import("../functions/node_modules/firebase-admin/lib/auth/index.js");
const { getFirestore, FieldValue, Timestamp } = await import("../functions/node_modules/firebase-admin/lib/firestore/index.js");
initializeApp({ projectId: PROJECT });
const auth = getAuth();
const db = getFirestore();

async function user(uid, email, displayName) {
  try { await auth.deleteUser(uid); } catch {}
  await auth.createUser({ uid, email, password: "test-password", emailVerified: true, displayName });
}

await user("admin1", "admin@test.kr", "업무 담당자");
await user("t41", "teacher41@test.kr", "4-1 담임");
await user("eng1", "english@test.kr", "영어 전담");
await user("pending1", "newteacher@test.kr", "신규 교사");
await user("s264101", "264101@haju.es.kr", "김하주");

const now = FieldValue.serverTimestamp();
await db.doc("users/admin1").set({ role: "admin", status: "active", name: "이성근", email: "admin@test.kr", teacherType: "subject", grades: [1,2,3,4,5,6], programs: ["reading","carbon","english"], createdAt: now });
await db.doc("users/t41").set({ role: "teacher", status: "active", name: "박담임", email: "teacher41@test.kr", teacherType: "homeroom", grade: 4, classNo: 1, grades: [4], programs: ["reading","carbon","english"], createdAt: now });
await db.doc("users/eng1").set({ role: "teacher", status: "active", name: "최영어", email: "english@test.kr", teacherType: "subject", grades: [4,5,6], programs: ["english"], createdAt: now });
await db.doc("users/pending1").set({ role: "teacher", status: "pending", name: "정신규", email: "newteacher@test.kr", teacherType: "homeroom", grade: 5, classNo: 3, grades: [5], programs: ["reading","carbon","english"], createdAt: now });

// 화면 캡처용 학생 1명 (264101 = 4학년 1반 1번)
const sid = "264101";
await db.doc(`students/${sid}`).set({ sid, grade: 4, classNo: 1, number: 1, name: "김하주", active: true, hasAccount: true, createdAt: now });
const books = ["마당을 나온 암탉", "어린 왕자", "샬롯의 거미줄", "긴긴밤", "책 먹는 여우", "몽실 언니"];
const batch = db.batch();
for (let i = 0; i < 43; i++) {
  batch.set(db.collection("submissions").doc(), { sid, grade: 4, classNo: 1, program: "reading", bookTitle: books[i % books.length], status: "active", source: "student", count: 1,
    createdAt: Timestamp.fromDate(new Date(Date.now() - (43 - i) * 3 * 86400000)),
    ai: { verdict: "ok", reason: "독서기록장 1쪽이 성실히 채워짐", feedback: "주인공의 마음을 잘 정리했어! 📚", question: i === 42 ? "내가 주인공이었다면 어떤 선택을 했을까?" : null, model: "demo" } });
}
const types = [["분리수거", "우유갑을 깨끗이 씻어서 분리수거했어요."], ["플로깅", "가족과 공원에서 쓰레기를 주웠어요."], ["다회용기·텀블러", "텀블러를 가지고 다녔어요."]];
for (let i = 0; i < 14; i++) {
  const [t, txt] = types[i % 3];
  batch.set(db.collection("submissions").doc(), { sid, grade: 4, classNo: 1, program: "carbon", activityType: t, text: txt, status: "active", source: "student", count: 1,
    createdAt: Timestamp.fromDate(new Date(Date.now() - (14 - i) * 7 * 86400000)), ai: { verdict: i === 13 ? "check" : "ok", reason: i === 13 ? "사진이 흐려 활동 확인이 어려움" : "분리수거 실천이 확인됨", feedback: "지구가 고마워할 거야! 🌏", model: "demo" } });
}
batch.set(db.collection("submissions").doc(), { sid, grade: 4, classNo: 1, program: "english", task: "t2", status: "active", source: "student", count: 1, createdAt: now });
const t3 = (await import("../data/english/task3-grade4.json", { with: { type: "json" } })).default;
const t1 = (await import("../data/english/task1-cartoon.json", { with: { type: "json" } })).default;
const round = (n) => Array.from({ length: n }, () => ({ typedOk: true, attempts: 1, durationMs: 2500, audioPath: "demo" }));
t1.items.slice(0, 33).forEach((it, i) => {
  const status = i < 30 ? "checked" : i === 30 ? "requested" : i === 31 ? "ready" : "practicing";
  batch.set(db.doc(`englishItems/${sid}_task1-cartoon_${it.no}`), { sid, grade: 4, classNo: 1, setId: "task1-cartoon", task: "t1", no: it.no, rounds: round(status === "practicing" ? 1 : 3), status,
    requestedAt: Timestamp.fromDate(new Date(Date.now() - (40 - i) * 86400000)), ...(status === "checked" ? { checkedByName: "최영어", checkedAt: now } : {}), updatedAt: now });
});
t3.items.filter((x) => x.type !== "student").slice(0, 12).forEach((it, i) => {
  const status = i < 8 ? "checked" : i < 11 ? "requested" : "practicing";
  batch.set(db.doc(`englishItems/${sid}_task3-grade4_${it.no}`), { sid, grade: 4, classNo: 1, setId: "task3-grade4", task: "t3", no: it.no, rounds: round(status === "practicing" ? 2 : 3), status,
    requestedAt: Timestamp.fromDate(new Date(Date.now() - (20 - i) * 3600000)), ...(status === "checked" ? { checkedByName: "최영어", checkedAt: now } : {}), updatedAt: now });
});
await batch.commit();
console.log("seeded accounts + student 264101");

// 관리자 토큰으로 Cloud Functions(더미 학급 데이터·문장 세트) 호출
const res = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@test.kr", password: "test-password", returnSecureToken: true }) });
const { idToken } = await res.json();
async function call(name, data = {}) {
  const r = await fetch(`http://127.0.0.1:5001/${PROJECT}/asia-northeast3/${name}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` }, body: JSON.stringify({ data }) });
  console.log(name, r.status, (await r.text()).slice(0, 200));
}
await call("seedSentenceSets");
await call("seedDemo", { classes: [{ grade: 4, classNo: 1 }, { grade: 4, classNo: 2 }, { grade: 5, classNo: 1 }, { grade: 6, classNo: 1 }, { grade: 3, classNo: 1 }] });
