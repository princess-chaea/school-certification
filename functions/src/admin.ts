import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, REGION, FieldValue, requireStaff, requireSchoolId, loadConfig, loadSchool, sp } from "./common.js";
import { recomputeStudent } from "./progress.js";
import { activePrograms, isCertified, taskSetIds, type StudentProgress } from "./shared/domain.js";
import { studentIdFor, englishItemId, type RosterRow } from "./shared/roster.js";
import task1 from "./shared/data/task1-cartoon.json" with { type: "json" };
import task3g4 from "./shared/data/task3-grade4.json" with { type: "json" };
import task3g5 from "./shared/data/task3-grade5.json" with { type: "json" };
import task3g6 from "./shared/data/task3-grade6.json" with { type: "json" };

/** 관리자: 학생 명단 CSV 일괄 등록 (이미 있는 학생은 학년·반·번호·이름 갱신) */
export const importRoster = onCall({ region: REGION, timeoutSeconds: 300 }, async (req) => {
  const schoolId = requireSchoolId(req.data);
  await requireStaff(req, schoolId, true);
  const { rows, deactivateMissing } = (req.data ?? {}) as { rows?: RosterRow[]; deactivateMissing?: boolean };
  if (!Array.isArray(rows) || !rows.length) throw new HttpsError("invalid-argument", "등록할 학생이 없어요.");
  if (rows.length > 3000) throw new HttpsError("invalid-argument", "한 번에 3000명까지 올릴 수 있어요.");
  const school = await loadSchool(schoolId);
  const year = school.year;
  const existing = new Map((await db.collection(sp(schoolId, "students")).get()).docs.map((d) => [d.id, d.data()]));
  const incoming = new Set<string>();
  let created = 0;
  let updated = 0;
  let batch = db.batch();
  let n = 0;
  const flush = async () => {
    if (n) await batch.commit();
    batch = db.batch();
    n = 0;
  };
  for (const r of rows) {
    const grade = Number(r.grade), classNo = Number(r.classNo), number = Number(r.number);
    const name = String(r.name ?? "").trim().slice(0, 30);
    const email = String(r.email ?? "").trim().toLowerCase();
    // 이름은 선택(계정 있는 학생만): 비우면 학생이 첫 로그인 때 입력. 이미 있는 이름은 빈 값으로 덮어쓰지 않음
    if (!(grade >= 1 && grade <= 6) || !(classNo >= 1) || (!name && !email)) continue;
    const sid = studentIdFor({ email, grade, classNo, number }, year);
    incoming.add(sid);
    const data = { sid, email, grade, classNo, number, ...(name ? { name } : {}), year, active: true, updatedAt: FieldValue.serverTimestamp() };
    if (email) {
      batch.set(db.doc(`studentIndex/${email}`), { schoolId, sid, year });
      n++;
    }
    if (existing.has(sid)) {
      batch.set(db.doc(sp(schoolId, `students/${sid}`)), data, { merge: true });
      updated++;
    } else {
      batch.set(db.doc(sp(schoolId, `students/${sid}`)), { name: "", ...data, hasAccount: false, createdAt: FieldValue.serverTimestamp() });
      created++;
    }
    if (++n >= 450) await flush();
  }
  let deactivated = 0;
  if (deactivateMissing) {
    for (const [sid, d] of existing) {
      if (!incoming.has(sid) && d.active !== false && !d.isDemo) {
        batch.update(db.doc(sp(schoolId, `students/${sid}`)), { active: false, updatedAt: FieldValue.serverTimestamp() });
        deactivated++;
        if (++n >= 450) await flush();
      }
    }
  }
  await flush();
  return { created, updated, deactivated, year };
});

/**
 * 관리자: 새 학년도 시작
 * - 현재 명단과 최종 진행률을 years/{학년도}/students 에 보관하고 학년도 요약을 남김
 * - 제출 기록·사진·녹음은 그대로 두고(year 필드로 구분) 현재 명단만 비움
 * - 담임 교사는 새 학급을 다시 선택하도록 승인 대기로 전환
 */
export const startNewYear = onCall({ region: REGION, timeoutSeconds: 540, memory: "512MiB" }, async (req) => {
  const schoolId = requireSchoolId(req.data);
  const admin = await requireStaff(req, schoolId, true);
  const { newYear, confirm } = (req.data ?? {}) as { newYear?: number; confirm?: string };
  const school = await loadSchool(schoolId);
  const oldYear = school.year;
  if (!newYear || newYear <= oldYear) throw new HttpsError("invalid-argument", `새 학년도는 ${oldYear + 1} 이상이어야 해요.`);
  if (confirm !== `${oldYear} 마감`) throw new HttpsError("failed-precondition", `확인 문구 "${oldYear} 마감"을 정확히 입력하세요.`);

  const students = await db.collection(sp(schoolId, "students")).get();
  const summary: { students: number; participants: number; certifiedAny: number; certified: Record<string, number> } = { students: 0, participants: 0, certifiedAny: 0, certified: {} };
  let batch = db.batch();
  let n = 0;
  const flush = async () => {
    if (n) await batch.commit();
    batch = db.batch();
    n = 0;
  };
  for (const d of students.docs) {
    const s = d.data();
    if (s.isDemo) {
      batch.delete(d.ref);
    } else {
      const p = (s.progress ?? {}) as StudentProgress;
      const entries = Object.entries(p);
      const participated = entries.some(([, v]) => (v?.count ?? 0) > 0);
      summary.students++;
      if (participated) summary.participants++;
      let any = false;
      for (const [id, v] of entries) {
        if (isCertified(v?.medal)) {
          summary.certified[id] = (summary.certified[id] ?? 0) + 1;
          any = true;
        }
      }
      if (any) summary.certifiedAny++;
      batch.set(db.doc(sp(schoolId, `years/${oldYear}/students/${d.id}`)), { ...s, archivedAt: FieldValue.serverTimestamp() });
      batch.delete(d.ref);
      if (s.email) batch.delete(db.doc(`studentIndex/${s.email}`));
      n += 2;
    }
    if (++n >= 400) await flush();
  }
  await flush();

  const config = await loadConfig(schoolId);
  await db.doc(sp(schoolId, `years/${oldYear}`)).set({
    year: oldYear,
    summary,
    config,
    schoolName: school.name,
    closedBy: admin.name ?? admin.uid,
    closedAt: FieldValue.serverTimestamp(),
  });

  const teachers = await db.collection(sp(schoolId, "staff")).where("homeroom", "==", true).get();
  for (const t of teachers.docs) {
    if (t.get("status") === "active") {
      // 새 학년도: 담임 학급을 다시 고르도록 담임 정보만 비운다 (학교 담당자 권한은 유지)
      batch.update(t.ref, { homeroom: false, grade: null, classNo: null, previousClass: `${t.get("grade")}-${t.get("classNo")}` });
      if (++n >= 400) await flush();
    }
  }
  await flush();
  await db.doc(sp(schoolId)).set({ year: newYear }, { merge: true });
  return { archived: summary.students, oldYear, newYear };
});

/** 영어 문장 세트(과제 1·3)를 Firestore 에 올린다. overwrite=false 이면 이미 있는 세트는 건너뜀 */
export const seedSentenceSets = onCall({ region: REGION }, async (req) => {
  const schoolId = requireSchoolId(req.data);
  await requireStaff(req, schoolId, true);
  const overwrite = Boolean((req.data as { overwrite?: boolean })?.overwrite);
  const sets = [task1, task3g4, task3g5, task3g6] as Array<{ setId: string }>;
  const written: string[] = [];
  for (const set of sets) {
    const ref = db.doc(sp(schoolId, `sentenceSets/${set.setId}`));
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

const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDate = (daysBack: number) => new Date(Date.now() - Math.random() * daysBack * 86400_000);
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

export const seedDemo = onCall({ region: REGION, timeoutSeconds: 540, memory: "512MiB" }, async (req) => {
  const schoolId = requireSchoolId(req.data);
  await requireStaff(req, schoolId, true);
  const { classes } = (req.data ?? {}) as { classes?: Array<{ grade: number; classNo: number }> };
  const targets = classes?.length ? classes : [{ grade: 3, classNo: 1 }, { grade: 4, classNo: 1 }, { grade: 5, classNo: 1 }, { grade: 6, classNo: 1 }];
  const [config, school] = await Promise.all([loadConfig(schoolId), loadSchool(schoolId)]);
  const year = school.year;
  const sets: Record<string, { items: Array<{ no: number; type?: string }> }> = {
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
  const flushMaybe = async () => {
    n++;
    await flush();
  };
  const sids: string[] = [];

  for (const { grade, classNo } of targets) {
    const count = randInt(21, 25);
    for (let number = 1; number <= count; number++) {
      // 더미 학생은 실제 계정과 겹치지 않는 가상 이메일을 쓴다
      const sid = `demo-${grade}${classNo}${String(number).padStart(2, "0")}@demo.invalid`;
      sids.push(sid);
      batch.set(db.doc(sp(schoolId, `students/${sid}`)), {
        sid, email: sid, grade, classNo, number, year,
        name: `${rand(SURNAMES)}${rand(GIVEN)}`,
        active: true, hasAccount: true, isDemo: true,
        createdAt: FieldValue.serverTimestamp(),
      });
      n++;
      const effort = Math.random();
      if (effort < 0.08) continue; // 미참여 학생
      const base = { sid, grade, classNo, year, status: "active", source: "student", count: 1, isDemo: true, seed: true };
      for (const p of activePrograms(config, grade)) {
        if (p.kind === "evidence") {
          const target = Number(p.targetByGrade?.[String(grade)] ?? 10);
          const cnt = Math.round(target * Math.min(2.1, effort * 1.6 + Math.random() * 0.4));
          for (let i = 0; i < cnt; i++) {
            const at = randomDate(200);
            const choice = p.choices?.length ? randInt(0, Math.min(p.choices.length, CARBON_TYPES.length) - 1) : -1;
            const fields: Record<string, string> = {};
            for (const f of p.fields ?? []) fields[f.key] = f.key === "bookTitle" ? rand(BOOKS) : `${f.label} 예시`;
            const ref = db.collection(sp(schoolId, "submissions")).doc();
            const pending = i >= cnt - 2 && p.approval === "teacher"; // 마지막 2건은 교사 확인 대기
            batch.set(ref, {
              ...base, status: pending ? "pending" : "active", program: p.id, createdAt: at, activityDate: dateKey(at), fields,
              ...(choice >= 0 ? { activityType: p.choices![choice], text: CARBON_TEXTS[choice] ?? "열심히 실천했어요." } : {}),
            });
            if (pending) {
              const v = Math.random();
              batch.set(db.doc(sp(schoolId, `aiReviews/${ref.id}`)), {
                sid, year, grade, classNo, program: p.id, isDemo: true, model: "demo",
                verdict: v < 0.8 ? "ok" : v < 0.95 ? "check" : "reject",
                reason: v < 0.8 ? "활동 증빙이 사진에서 확인돼요 (시연)" : v < 0.95 ? "사진이 흐려 활동 확인이 어려워요 (시연)" : "활동과 관계없는 사진 같아요 (시연)",
              });
              n++;
            }
            await flushMaybe();
          }
        } else {
          for (const t of p.tasks ?? []) {
            const done = Math.round(t.goal * Math.min(1, effort * (t.kind === "sentences" ? 1.2 : 1.4) - Math.random() * 0.2));
            if (t.kind === "sentences") {
              const setId = taskSetIds(t, grade)[0];
              const items = (sets[setId]?.items ?? []).filter((it) => it.type !== "student").slice(0, Math.max(0, done) + 2);
              items.forEach((it, i) => {
                const checked = i < done;
                batch.set(db.doc(sp(schoolId, `englishItems/${englishItemId(year, sid, setId, it.no)}`)), {
                  sid, grade, classNo, year, program: p.id, setId, task: t.id, no: it.no, isDemo: true, seed: true,
                  rounds: [1, 2, 3].map(() => ({ typedOk: true, attempts: randInt(1, 2), durationMs: randInt(1500, 4000) })),
                  status: checked ? "checked" : "requested",
                  requestedAt: randomDate(60),
                  ...(checked ? { checkedByName: "영어 선생님", checkedAt: randomDate(30) } : {}),
                  updatedAt: FieldValue.serverTimestamp(),
                });
                n++;
              });
            } else {
              for (let i = 0; i < Math.max(0, done); i++) {
                batch.set(db.collection(sp(schoolId, "submissions")).doc(), {
                  ...base, program: p.id, task: t.id, createdAt: randomDate(90),
                  ...(t.minAudioSec ? { durationSec: t.minAudioSec + randInt(1, 60) } : {}),
                  fields: Object.fromEntries((t.fields ?? []).map((f) => [f.key, `Fun Reading Book ${i + 1}`])),
                });
                n++;
              }
            }
            await flush();
          }
        }
      }
    }
  }
  await flush(true);
  for (let i = 0; i < sids.length; i += 10) await Promise.all(sids.slice(i, i + 10).map((sid) => recomputeStudent(schoolId, sid)));
  return { students: sids.length };
});

export const clearDemo = onCall({ region: REGION, timeoutSeconds: 540 }, async (req) => {
  const schoolId = requireSchoolId(req.data);
  await requireStaff(req, schoolId, true);
  let deleted = 0;
  for (const col of ["submissions", "englishItems", "students", "aiReviews"]) {
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

/** 관리자: 전체 진행률 다시 계산 (기준 변경 후) */
export const recomputeAll = onCall({ region: REGION, timeoutSeconds: 540 }, async (req) => {
  const schoolId = requireSchoolId(req.data);
  await requireStaff(req, schoolId, true);
  const snap = await db.collection(sp(schoolId, "students")).select().get();
  const ids = snap.docs.map((d) => d.id);
  for (let i = 0; i < ids.length; i += 20) await Promise.all(ids.slice(i, i + 20).map((sid) => recomputeStudent(schoolId, sid)));
  return { students: ids.length };
});
