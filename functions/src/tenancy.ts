import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { db, REGION, FieldValue, isSuper, requireSuper, sp } from "./common.js";
import { neisResultMessage, parseNeisSchoolInfo, shortSchoolName, type NeisSchool } from "./shared/school.js";
import { SCHOOL_YEAR } from "./shared/domain.js";

// NEIS 교육정보 개방 포털 인증키 (firebase functions:secrets:set NEIS_API_KEY)
export const NEIS_API_KEY = defineSecret("NEIS_API_KEY");

/** 로그인한 사람이 누구인지: 학생(학교 명단) / 교사(소속 학교) / 학교 개설 신청 중 / 운영자 */
export const whoami = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  const uid = req.auth.uid;
  const email = String(req.auth.token.email ?? "").toLowerCase();
  const out: Record<string, unknown> = { super: await isSuper(uid) };

  if (email && req.auth.token.email_verified === true) {
    const idx = await db.doc(`studentIndex/${email}`).get();
    if (idx.exists) {
      const { schoolId, sid } = idx.data() as { schoolId: string; sid: string };
      const ref = db.doc(sp(schoolId, `students/${sid}`));
      const stu = await ref.get();
      if (stu.exists && stu.get("active") !== false) {
        await ref.update({ hasAccount: true, uid, lastLoginAt: FieldValue.serverTimestamp() });
        out.student = { schoolId, sid };
        return out;
      }
    }
  }

  const user = await db.doc(`users/${uid}`).get();
  const schoolId = user.get("schoolId") as string | undefined;
  if (schoolId) {
    const staff = await db.doc(sp(schoolId, `staff/${uid}`)).get();
    if (staff.exists) out.staff = { schoolId, status: staff.get("status"), role: staff.get("role") };
  }
  const reqs = await db.collection("schoolRequests").where("uid", "==", uid).where("status", "==", "pending").limit(1).get();
  if (!reqs.empty) {
    const r = reqs.docs[0].data();
    out.request = { id: reqs.docs[0].id, schoolName: r.neis?.name, schoolId: r.schoolId };
  }
  return out;
});

/** NEIS 학교 기본정보에서 학교 이름으로 검색 (가입·개설용, 로그인 필요) */
export const searchSchools = onCall({ region: REGION, secrets: [NEIS_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  const query = String((req.data as { query?: string })?.query ?? "").trim();
  if (query.length < 2) throw new HttpsError("invalid-argument", "학교 이름을 두 글자 이상 입력하세요.");
  const url = new URL("https://open.neis.go.kr/hub/schoolInfo");
  url.searchParams.set("KEY", NEIS_API_KEY.value());
  url.searchParams.set("Type", "json");
  url.searchParams.set("pIndex", "1");
  url.searchParams.set("pSize", "30");
  url.searchParams.set("SCHUL_NM", query);
  let schools: NeisSchool[] = [];
  let message: string | null = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const json = (await res.json()) as unknown;
    schools = parseNeisSchoolInfo(json);
    message = schools.length ? null : neisResultMessage(json) ?? "검색 결과가 없어요.";
  } catch (err) {
    logger.error("NEIS search failed", { err: String(err) });
    throw new HttpsError("unavailable", "NEIS 학교 정보를 불러오지 못했어요. 잠시 후 다시 시도하세요.");
  }
  // 이미 개설된 학교 표시
  const opened = new Set<string>();
  await Promise.all(
    schools.map(async (s) => {
      const snap = await db.doc(sp(s.schoolCode)).get();
      if (snap.exists && snap.get("status") === "active") opened.add(s.schoolCode);
    }),
  );
  return { schools: schools.map((s) => ({ ...s, opened: opened.has(s.schoolCode) })), message };
});

interface JoinInput {
  neis: NeisSchool;
  name: string;
  teacherType: "homeroom" | "subject";
  grade?: number;
  classNo?: number;
  grades?: number[];
  programs?: string[];
}

function staffDraft(input: JoinInput, email: string) {
  const name = String(input.name ?? "").trim().slice(0, 30);
  if (!name) throw new HttpsError("invalid-argument", "이름을 입력하세요.");
  const programs = (input.programs ?? []).filter((p) => ["reading", "carbon", "english"].includes(p));
  if (input.teacherType === "homeroom") {
    const grade = Number(input.grade), classNo = Number(input.classNo);
    if (!(grade >= 1 && grade <= 6 && classNo >= 1 && classNo <= 20)) throw new HttpsError("invalid-argument", "학년·반을 확인하세요.");
    return { name, email, teacherType: "homeroom", grade, classNo, grades: [grade], programs: ["reading", "carbon", "english"] };
  }
  const grades = (input.grades ?? []).map(Number).filter((g) => g >= 1 && g <= 6);
  if (!grades.length || !programs.length) throw new HttpsError("invalid-argument", "담당 학년과 분야를 고르세요.");
  return { name, email, teacherType: "subject", grade: null, classNo: null, grades, programs };
}

/** 교사 가입 신청: 개설된 학교면 그 학교 관리자 승인 대기, 없는 학교면 학교 개설 신청(운영자 승인) */
export const requestJoin = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  const input = req.data as JoinInput;
  const neis = input?.neis;
  if (!neis?.schoolCode || !neis?.name) throw new HttpsError("invalid-argument", "학교를 선택하세요.");
  const email = String(req.auth.token.email ?? "").toLowerCase();
  const uid = req.auth.uid;
  const schoolId = neis.schoolCode;
  const draft = staffDraft(input, email);
  const school = await db.doc(sp(schoolId)).get();

  if (school.exists && school.get("status") === "active") {
    const ref = db.doc(sp(schoolId, `staff/${uid}`));
    const cur = await ref.get();
    if (cur.exists && cur.get("status") === "active") return { status: "active", schoolId };
    await ref.set({ ...draft, role: cur.get("role") ?? "teacher", status: "pending", createdAt: cur.get("createdAt") ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await db.doc(`users/${uid}`).set({ schoolId, email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { status: "pending", schoolId };
  }

  await db.doc(`schoolRequests/${schoolId}_${uid}`).set({
    schoolId, uid, email, neis: { ...neis }, staff: draft, status: "pending", createdAt: FieldValue.serverTimestamp(),
  });
  return { status: "requested", schoolId };
});

/** 운영자: 학교 개설 승인 → 학교 생성 + 신청 교사를 그 학교 관리자로 */
export const approveSchoolRequest = onCall({ region: REGION }, async (req) => {
  await requireSuper(req);
  const { id, approve } = req.data as { id?: string; approve?: boolean };
  if (!id) throw new HttpsError("invalid-argument", "신청을 선택하세요.");
  const ref = db.doc(`schoolRequests/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "신청을 찾을 수 없어요.");
  const r = snap.data() as { schoolId: string; uid: string; email: string; neis: NeisSchool; staff: Record<string, unknown> };
  if (!approve) {
    await ref.update({ status: "rejected", decidedAt: FieldValue.serverTimestamp() });
    return { ok: true };
  }
  const schoolRef = db.doc(sp(r.schoolId));
  const existing = await schoolRef.get();
  if (!existing.exists) {
    await schoolRef.set({
      name: r.neis.name,
      shortName: shortSchoolName(r.neis.name),
      principalName: "",
      studentDomain: "",
      year: SCHOOL_YEAR,
      logoUrl: "",
      sealUrl: "",
      neis: r.neis,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    });
  } else if (existing.get("status") !== "active") {
    await schoolRef.update({ status: "active" });
  }
  await db.doc(sp(r.schoolId, `staff/${r.uid}`)).set({ ...r.staff, role: "admin", status: "active", createdAt: FieldValue.serverTimestamp() });
  await db.doc(`users/${r.uid}`).set({ schoolId: r.schoolId, email: r.email }, { merge: true });
  await ref.update({ status: "approved", decidedAt: FieldValue.serverTimestamp() });
  return { ok: true, schoolId: r.schoolId };
});
