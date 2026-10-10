import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, REGION, FieldValue, requireStaff, loadConfig } from "./common.js";
import { recomputeStudent } from "./progress.js";
import { parseStudentEmail, makeSid, englishTaskForGrade } from "./shared/domain.js";
import task1 from "./shared/data/task1-cartoon.json" with { type: "json" };
import task3g4 from "./shared/data/task3-grade4.json" with { type: "json" };
import task3g5 from "./shared/data/task3-grade5.json" with { type: "json" };
import task3g6 from "./shared/data/task3-grade6.json" with { type: "json" };

export const CLASSES_PER_GRADE: Record<number, number> = { 1: 5, 2: 5, 3: 6, 4: 6, 5: 6, 6: 6 };

/** 학생 첫 로그인: 이메일(26GCNN)로 학년·반·번호를 읽어 students/{sid} 를 만들거나 갱신 */
export const registerStudent = onCall({ region: REGION }, async (req) => {
  const parsed = parseStudentEmail(req.auth?.token.email);
  if (!parsed || req.auth?.token.email_verified !== true) throw new HttpsError("permission-denied", "학교 계정(@haju.es.kr)으로 로그인해 주세요.");
  const ref = db.doc(`students/${parsed.sid}`);
  const displayName = String(req.auth?.token.name ?? "").trim();
  const nameFromGoogle = displayName && !/^\d+$/.test(displayName) ? displayName : "";
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, {
        sid: parsed.sid,
        grade: parsed.grade,
        classNo: parsed.classNo,
        number: parsed.number,
        name: nameFromGoogle,
        active: true,
        hasAccount: true,
        uid: req.auth!.uid,
        createdAt: FieldValue.serverTimestamp(),
        lastLoginAt: FieldValue.serverTimestamp(),
      });
    } else {
      const update: Record<string, unknown> = { hasAccount: true, uid: req.auth!.uid, lastLoginAt: FieldValue.serverTimestamp() };
      if (!snap.get("name") && nameFromGoogle) update.name = nameFromGoogle;
      if (snap.get("active") === false) update.active = true;
      tx.update(ref, update);
    }
  });
  return { sid: parsed.sid };
});

/** 3~6학년 반마다 1~25번 학생 칸을 미리 만든다 (쓰지 않는 번호는 담임이 정리) */
export const setupRoster = onCall({ region: REGION, timeoutSeconds: 300 }, async (req) => {
  await requireStaff(req, true);
  const perClass = Number((req.data as { perClass?: number })?.perClass ?? 25);
  const existing = new Set((await db.collection("students").select().get()).docs.map((d) => d.id));
  let batch = db.batch();
  let n = 0;
  let created = 0;
  for (const grade of [3, 4, 5, 6]) {
    for (let classNo = 1; classNo <= CLASSES_PER_GRADE[grade]; classNo++) {
      for (let number = 1; number <= perClass; number++) {
        const sid = makeSid(grade, classNo, number);
        if (existing.has(sid)) continue;
        batch.set(db.doc(`students/${sid}`), {
          sid, grade, classNo, number, name: "", active: true, hasAccount: false,
          createdAt: FieldValue.serverTimestamp(),
        });
        created++;
        if (++n === 450) {
          await batch.commit();
          batch = db.batch();
          n = 0;
        }
      }
    }
  }
  if (n) await batch.commit();
  return { created };
});

/** 영어 문장 세트(과제 1·3)를 Firestore 에 올린다. overwrite=false 이면 이미 있는 세트는 건너뜀 */
export const seedSentenceSets = onCall({ region: REGION }, async (req) => {
  await requireStaff(req, true);
  const overwrite = Boolean((req.data as { overwrite?: boolean })?.overwrite);
  const sets = [task1, task3g4, task3g5, task3g6] as Array<{ setId: string }>;
  const written: string[] = [];
  for (const set of sets) {
    const ref = db.doc(`sentenceSets/${set.setId}`);
    if (!overwrite && (await ref.get()).exists) continue;
    await ref.set({ ...set, updatedAt: FieldValue.serverTimestamp() });
    written.push(set.setId);
  }
  return { written };
});

// ── 시연용 더미 데이터 ──────────────────────────────────────────────

const SURNAMES = "김이박최정강조윤장임한오서신권황안송류홍".split("");
const GIVEN = ["민준", "서연", "도윤", "하은", "시우", "지유", "주원", "서윤", "예준", "하린", "지호", "수아", "건우", "지아", "우진", "채원", "선우", "다은", "현우", "예린", "준서", "소율", "은우", "윤서", "태윤"];
const BOOKS = ["마당을 나온 암탉", "어린 왕자", "샬롯의 거미줄", "강아지똥", "나쁜 어린이 표", "만복이네 떡집", "아낌없이 주는 나무", "긴긴밤", "책 먹는 여우", "멋진 여우 씨", "푸른 사자 와니니", "몽실 언니"];
const CARBON_TEXTS = ["우유갑을 씻어서 따로 모았어요.", "가족과 함께 동네 공원에서 플로깅을 했어요.", "학교까지 걸어서 왔어요.", "텀블러에 물을 담아 다녔어요.", "교실 화분에 물을 주었어요.", "안 쓰는 방 불을 껐어요.", "급식을 남기지 않고 다 먹었어요."];
const CARBON_TYPES = ["분리수거", "플로깅", "대중교통·걷기", "다회용기·텀블러", "식물 기르기", "전기·물 아끼기", "잔반 없는 날"];

function rand<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomDate(daysBack: number) {
  return new Date(Date.now() - Math.random() * daysBack * 86400_000);
}

export const seedDemo = onCall({ region: REGION, timeoutSeconds: 540, memory: "512MiB" }, async (req) => {
  await requireStaff(req, true);
  const { classes } = (req.data ?? {}) as { classes?: Array<{ grade: number; classNo: number }> };
  const targets = classes?.length ? classes : [{ grade: 3, classNo: 1 }, { grade: 4, classNo: 1 }, { grade: 5, classNo: 1 }, { grade: 6, classNo: 1 }];
  const config = await loadConfig();
  const sets: Record<string, { items: Array<{ no: number; en: string; ko: string; type?: string }> }> = {
    "task1-cartoon": task1, "task3-grade4": task3g4, "task3-grade5": task3g5, "task3-grade6": task3g6,
  } as never;

  let batch = db.batch();
  let n = 0;
  const flush = async (force = false) => {
    if (n >= 400 || (force && n)) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  };
  const sids: string[] = [];

  for (const { grade, classNo } of targets) {
    const count = randInt(21, 25);
    for (let number = 1; number <= count; number++) {
      // 더미 학생 ID는 실제 계정(26xxxx)과 겹치지 않도록 99xxxx 를 쓴다
      const sid = makeSid(grade, classNo, number, 2099);
      sids.push(sid);
      batch.set(db.doc(`students/${sid}`), {
        sid, grade, classNo, number,
        name: `${rand(SURNAMES)}${rand(GIVEN)}`,
        active: true, hasAccount: true, isDemo: true,
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      n++;
      // 참여 정도를 학생마다 다르게 (미참여 ~ 금)
      const effort = Math.random();
      if (effort < 0.08) continue;
      const base = { sid, grade, classNo, status: "active", source: "student", count: 1, isDemo: true, seed: true };
      const readingBase = Number(config.programs.reading.baseByGrade?.[String(grade)] ?? 30);
      const readingN = Math.round(readingBase * Math.min(2.1, effort * 1.6 + Math.random() * 0.4));
      for (let i = 0; i < readingN; i++) {
        batch.set(db.collection("submissions").doc(), { ...base, program: "reading", bookTitle: rand(BOOKS), createdAt: randomDate(200),
          ai: { verdict: Math.random() < 0.94 ? "ok" : "check", reason: "시연용 데이터", feedback: "꾸준히 읽는 모습이 멋져! 📚", model: "demo" } });
        n++;
        await flush();
      }
      const carbonN = Math.round(20 * Math.min(2.1, effort * 1.5 + Math.random() * 0.4));
      for (let i = 0; i < carbonN; i++) {
        const idx = randInt(0, CARBON_TYPES.length - 1);
        batch.set(db.collection("submissions").doc(), { ...base, program: "carbon", activityType: CARBON_TYPES[idx], text: CARBON_TEXTS[idx], createdAt: randomDate(200),
          ai: { verdict: "ok", reason: "시연용 데이터", feedback: "지구가 고마워할 거야! 🌏", model: "demo" } });
        n++;
        await flush();
      }
      if (grade >= 4) {
        const t3 = englishTaskForGrade(config.englishTasks.find((t) => t.id === "t3")!, grade);
        const plan: Array<[string, string, number]> = [
          ["t1", "task1-cartoon", Math.round(30 * Math.min(1, effort * 1.3))],
          ["t3", t3.setIds![0], Math.round(40 * Math.min(1, effort * 1.1))],
        ];
        for (const [task, setId, done] of plan) {
          const items = sets[setId].items.filter((it) => it.type !== "student").slice(0, done + 2);
          items.forEach((it, i) => {
            const checked = i < done;
            batch.set(db.doc(`englishItems/${sid}_${setId}_${it.no}`), {
              sid, grade, classNo, setId, task, no: it.no, isDemo: true, seed: true,
              rounds: [1, 2, 3].map(() => ({ typedOk: true, attempts: randInt(1, 2), durationMs: randInt(1500, 4000) })),
              status: checked ? "checked" : "requested",
              requestedAt: randomDate(60),
              ...(checked ? { checkedByName: "영어 선생님", checkedAt: randomDate(30) } : {}),
              updatedAt: FieldValue.serverTimestamp(),
            });
            n++;
          });
          await flush();
        }
        if (effort > 0.4) {
          batch.set(db.collection("submissions").doc(), { ...base, program: "english", task: "t2", createdAt: randomDate(90) });
          n++;
        }
        const t4n = effort > 0.6 ? randInt(2, 4) : effort > 0.3 ? randInt(0, 2) : 0;
        for (let i = 0; i < t4n; i++) {
          batch.set(db.collection("submissions").doc(), { ...base, program: "english", task: "t4", bookTitle: `Fun Reading Book ${i + 1}`, durationSec: randInt(121, 180), createdAt: randomDate(90) });
          n++;
        }
        await flush();
      }
    }
  }
  await flush(true);
  // 진행률은 마지막에 학생별로 한 번만 계산
  for (let i = 0; i < sids.length; i += 10) await Promise.all(sids.slice(i, i + 10).map((sid) => recomputeStudent(sid)));
  return { students: sids.length };
});

export const clearDemo = onCall({ region: REGION, timeoutSeconds: 540 }, async (req) => {
  await requireStaff(req, true);
  let deleted = 0;
  for (const col of ["submissions", "englishItems", "students"]) {
    for (;;) {
      const snap = await db.collection(col).where("isDemo", "==", true).limit(400).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
    }
  }
  return { deleted };
});

/** 관리자: 학생 한 명 또는 전체 진행률 다시 계산 (설정 변경 후) */
export const recomputeAll = onCall({ region: REGION, timeoutSeconds: 540 }, async (req) => {
  await requireStaff(req, true);
  const snap = await db.collection("students").select().get();
  const ids = snap.docs.map((d) => d.id);
  for (let i = 0; i < ids.length; i += 20) await Promise.all(ids.slice(i, i + 20).map((sid) => recomputeStudent(sid)));
  return { students: ids.length };
});
