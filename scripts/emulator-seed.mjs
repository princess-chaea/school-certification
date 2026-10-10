// 에뮬레이터용 테스트 학교·계정·데이터 생성: node scripts/emulator-seed.mjs
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
const PROJECT = "demo-haju";
const SCHOOL = "7000001"; // 테스트용 학교코드 (실제는 NEIS 표준학교코드)
const { initializeApp } = await import("../functions/node_modules/firebase-admin/lib/app/index.js");
const { getAuth } = await import("../functions/node_modules/firebase-admin/lib/auth/index.js");
const { getFirestore, FieldValue, Timestamp } = await import("../functions/node_modules/firebase-admin/lib/firestore/index.js");
initializeApp({ projectId: PROJECT });
const auth = getAuth();
const db = getFirestore();
const S = (p) => `schools/${SCHOOL}/${p}`;

async function user(uid, email, displayName) {
  try { await auth.deleteUser(uid); } catch {}
  await auth.createUser({ uid, email, password: "test-password", emailVerified: true, displayName });
}
await user("admin1", "admin@test.kr", "업무 담당자");
await user("t41", "teacher41@test.kr", "4-1 담임");
await user("eng1", "english@test.kr", "영어 전담");
await user("pending1", "newteacher@test.kr", "신규 교사");
await user("s264101", "264101@haju.es.kr", "김하주");
await user("nobody", "someone@gmail.com", "새 선생님");

const now = FieldValue.serverTimestamp();
await db.doc(`schools/${SCHOOL}`).set({
  name: "하주초등학교", shortName: "하주초", principalName: "문석주", studentDomain: "haju.es.kr", year: 2026,
  logoUrl: "/logo.png", sealUrl: "/cert/seal.jpg", status: "active",
  neis: { atptCode: "R10", atptName: "경상북도교육청", schoolCode: SCHOOL, name: "하주초등학교", kind: "초등학교", region: "경상북도", jurisdiction: "경상북도경산교육지원청", address: "경상북도 (테스트 주소)" },
});
await db.doc("superAdmins/admin1").set({ note: "플랫폼 운영자" });
const staff = [
  ["admin1", { role: "admin", status: "active", name: "이성근", email: "admin@test.kr", teacherType: "subject", grades: [1,2,3,4,5,6], programs: ["reading","carbon","english"] }],
  ["t41", { role: "teacher", status: "active", name: "박담임", email: "teacher41@test.kr", teacherType: "homeroom", grade: 4, classNo: 1, grades: [4], programs: ["reading","carbon","english"] }],
  ["eng1", { role: "teacher", status: "active", name: "최영어", email: "english@test.kr", teacherType: "subject", grades: [4,5,6], programs: ["english"] }],
  ["pending1", { role: "teacher", status: "pending", name: "정신규", email: "newteacher@test.kr", teacherType: "homeroom", grade: 5, classNo: 3, grades: [5], programs: ["reading","carbon","english"] }],
];
for (const [uid, d] of staff) {
  await db.doc(S(`staff/${uid}`)).set({ ...d, createdAt: now });
  await db.doc(`users/${uid}`).set({ schoolId: SCHOOL, email: d.email });
}
await db.doc(`schoolRequests/7000002_nobody`).set({ schoolId: "7000002", uid: "nobody", email: "someone@gmail.com", status: "pending", createdAt: now,
  neis: { atptCode: "R10", atptName: "경상북도교육청", schoolCode: "7000002", name: "경산초등학교", kind: "초등학교", region: "경상북도", jurisdiction: "경상북도경산교육지원청", address: "경상북도 경산시 (예시)" },
  staff: { name: "홍교사", email: "someone@gmail.com", teacherType: "homeroom", grade: 3, classNo: 2 } });

// 화면 캡처용 학생 (명단에 등록된 계정)
const sid = "264101@haju.es.kr";
await db.doc(S(`students/${sid}`)).set({ sid, email: sid, grade: 4, classNo: 1, number: 1, name: "김하주", year: 2026, active: true, hasAccount: true, createdAt: now });
await db.doc(`studentIndex/${sid}`).set({ schoolId: SCHOOL, sid, year: 2026 });
const books = ["마당을 나온 암탉", "어린 왕자", "샬롯의 거미줄", "긴긴밤", "책 먹는 여우", "몽실 언니"];
const day = (n) => new Date(Date.now() - n * 86400000);
const key = (d) => d.toISOString().slice(0, 10);
const batch = db.batch();
for (let i = 0; i < 43; i++) {
  const at = day((43 - i) * 3);
  batch.set(db.collection(S("submissions")).doc(), { sid, year: 2026, grade: 4, classNo: 1, program: "reading", bookTitle: books[i % books.length], status: "active", source: "student", count: 1, createdAt: Timestamp.fromDate(at), activityDate: key(at),
    ai: { verdict: "ok", reason: "독서기록장 1쪽이 성실히 채워짐", feedback: "주인공의 마음을 잘 정리했어! 📚", question: i === 42 ? "내가 주인공이었다면 어떤 선택을 했을까?" : null, model: "demo" } });
}
const types = [["분리수거", "우유갑을 깨끗이 씻어서 분리수거했어요."], ["플로깅", "가족과 공원에서 쓰레기를 주웠어요."], ["다회용기·텀블러", "텀블러를 가지고 다녔어요."]];
for (let i = 0; i < 14; i++) {
  const [t, txt] = types[i % 3];
  const at = day((14 - i) * 7);
  batch.set(db.collection(S("submissions")).doc(), { sid, year: 2026, grade: 4, classNo: 1, program: "carbon", activityType: t, text: txt, status: "active", source: "student", count: 1, createdAt: Timestamp.fromDate(at), activityDate: key(at),
    ai: { verdict: i === 13 ? "check" : "ok", reason: i === 13 ? "사진이 흐려 활동 확인이 어려움" : "분리수거 실천이 확인됨", feedback: "지구가 고마워할 거야! 🌏", model: "demo" } });
}
batch.set(db.collection(S("submissions")).doc(), { sid, year: 2026, grade: 4, classNo: 1, program: "english", task: "t2", status: "active", source: "student", count: 1, createdAt: now });
const t3 = (await import("../data/english/task3-grade4.json", { with: { type: "json" } })).default;
const t1 = (await import("../data/english/task1-cartoon.json", { with: { type: "json" } })).default;
const round = (n) => Array.from({ length: n }, () => ({ typedOk: true, attempts: 1, durationMs: 2500, audioPath: "demo" }));
t1.items.slice(0, 33).forEach((it, i) => {
  const status = i < 30 ? "checked" : i === 30 ? "requested" : i === 31 ? "ready" : "practicing";
  batch.set(db.doc(S(`englishItems/2026_${sid}_task1-cartoon_${it.no}`)), { sid, year: 2026, grade: 4, classNo: 1, setId: "task1-cartoon", task: "t1", no: it.no, rounds: round(status === "practicing" ? 1 : 3), status,
    requestedAt: Timestamp.fromDate(day(40 - i)), ...(status === "checked" ? { checkedByName: "최영어", checkedAt: now } : {}), updatedAt: now });
});
t3.items.filter((x) => x.type !== "student").slice(0, 12).forEach((it, i) => {
  const status = i < 8 ? "checked" : i < 11 ? "requested" : "practicing";
  batch.set(db.doc(S(`englishItems/2026_${sid}_task3-grade4_${it.no}`)), { sid, year: 2026, grade: 4, classNo: 1, setId: "task3-grade4", task: "t3", no: it.no, rounds: round(status === "practicing" ? 2 : 3), status,
    requestedAt: Timestamp.fromDate(new Date(Date.now() - (20 - i) * 3600000)), ...(status === "checked" ? { checkedByName: "최영어", checkedAt: now } : {}), updatedAt: now });
});
await batch.commit();
console.log("seeded school + accounts + student");

const res = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@test.kr", password: "test-password", returnSecureToken: true }) });
const { idToken } = await res.json();
async function call(name, data = {}) {
  const r = await fetch(`http://127.0.0.1:5001/${PROJECT}/asia-northeast3/${name}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` }, body: JSON.stringify({ data: { schoolId: SCHOOL, ...data } }) });
  console.log(name, r.status, (await r.text()).slice(0, 200));
}
await call("seedSentenceSets");
await call("seedDemo", { classes: [{ grade: 4, classNo: 1 }, { grade: 4, classNo: 2 }, { grade: 5, classNo: 1 }, { grade: 6, classNo: 1 }, { grade: 3, classNo: 1 }, { grade: 1, classNo: 1 }] });
await call("recomputeAll");
