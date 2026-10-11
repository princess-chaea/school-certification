import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { db, REGION, FieldValue, isSuper, loadConfig, requireSuper, sp } from "./common.js";
import { neisResultMessage, parseNeisSchoolInfo, shortSchoolName, type NeisSchool } from "./shared/school.js";
import { DEFAULT_CONFIG, SCHOOL_YEAR } from "./shared/domain.js";

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

// 같은 검색어는 10분 동안 NEIS 에 다시 묻지 않음 (입력하는 대로 찾기라 호출이 잦음)
const searchCache = new Map<string, { at: number; schools: NeisSchool[]; message: string | null }>();

// 에뮬레이터(로컬 테스트)는 NEIS 에 닿지 않으므로 예시 학교로 대신 보여 줌
const EMULATOR_SCHOOLS: NeisSchool[] = ["하주초등학교:7000001", "하양초등학교:7000002", "하남초등학교:7000003", "하주중학교:7000004", "경산하양초등학교:7000005"].map((x) => {
  const [name, schoolCode] = x.split(":");
  return { name, schoolCode, atptCode: "R10", atptName: "경상북도교육청", kind: name.endsWith("중학교") ? "중학교" : "초등학교", region: "경상북도", jurisdiction: "경상북도경산교육지원청", address: "경상북도 (에뮬레이터 예시)" };
});

/** NEIS 학교 기본정보에서 학교 이름(일부)으로 검색 (가입·개설용, 로그인 필요) */
export const searchSchools = onCall({ region: REGION, secrets: [NEIS_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  const query = String((req.data as { query?: string })?.query ?? "").trim().slice(0, 30);
  if (!query) throw new HttpsError("invalid-argument", "학교 이름을 입력하세요.");
  let schools: NeisSchool[] = [];
  let message: string | null = null;
  const hit = searchCache.get(query);
  if (hit && Date.now() - hit.at < 10 * 60_000) {
    ({ schools, message } = hit);
  } else if (process.env.FUNCTIONS_EMULATOR === "true") {
    schools = EMULATOR_SCHOOLS.filter((s) => s.name.includes(query));
    message = schools.length ? null : "검색 결과가 없어요.";
  } else {
    const url = new URL("https://open.neis.go.kr/hub/schoolInfo");
    url.searchParams.set("KEY", NEIS_API_KEY.value());
    url.searchParams.set("Type", "json");
    url.searchParams.set("pIndex", "1");
    url.searchParams.set("pSize", "30");
    url.searchParams.set("SCHUL_NM", query);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      const json = (await res.json()) as unknown;
      schools = parseNeisSchoolInfo(json);
      message = schools.length ? null : neisResultMessage(json) ?? "검색 결과가 없어요.";
    } catch (err) {
      logger.error("NEIS search failed", { err: String(err) });
      throw new HttpsError("unavailable", "NEIS 학교 정보를 불러오지 못했어요. 잠시 후 다시 시도하세요.");
    }
    if (searchCache.size > 500) searchCache.clear();
    searchCache.set(query, { at: Date.now(), schools, message });
  }
  // 이미 개설된 학교 표시 (이름 앞쪽이 검색어와 맞는 학교를 먼저)
  const opened = new Set<string>();
  await Promise.all(
    schools.map(async (s) => {
      const snap = await db.doc(sp(s.schoolCode)).get();
      if (snap.exists && snap.get("status") === "active") opened.add(s.schoolCode);
    }),
  );
  const rank = (s: NeisSchool) => (opened.has(s.schoolCode) ? 0 : 2) + (s.name.startsWith(query) ? 0 : 1);
  return { schools: [...schools].sort((a, b) => rank(a) - rank(b)).map((s) => ({ ...s, opened: opened.has(s.schoolCode) })), message };
});

/** 가입 화면: 고른 학교가 개설되어 있는지, 전담 담당 항목으로 고를 인증 항목 목록 */
export const schoolPrograms = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  const schoolId = String((req.data as { schoolId?: string })?.schoolId ?? "");
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(schoolId)) throw new HttpsError("invalid-argument", "학교를 선택하세요.");
  const snap = await db.doc(sp(schoolId)).get();
  const opened = snap.exists && snap.get("status") === "active";
  const config = opened ? await loadConfig(schoolId) : DEFAULT_CONFIG;
  return {
    opened,
    joinPolicy: opened ? snap.get("joinPolicy") ?? "open" : "open",
    programs: config.programs.filter((p) => p.enabled).map((p) => ({ id: p.id, name: p.name, icon: p.icon, grades: p.grades })),
  };
});

interface JoinInput {
  neis: NeisSchool;
  name: string;
  admin?: boolean; // 관리자
  homeroom?: { grade: number; classNo: number } | null; // 담임
  subject?: { grades: number[]; programs: string[]; subjectClasses?: { grade: number; classNo: number }[] } | null; // 전담
}

function staffDraft(input: JoinInput, email: string) {
  const name = String(input.name ?? "").trim().slice(0, 30);
  if (!name) throw new HttpsError("invalid-argument", "이름을 입력하세요.");
  const out: Record<string, unknown> = { name, email, homeroom: false, grade: null, classNo: null, subject: false, grades: [], programs: [], subjectClasses: [] };
  if (input.homeroom) {
    const grade = Number(input.homeroom.grade), classNo = Number(input.homeroom.classNo);
    if (!(Number.isInteger(grade) && Number.isInteger(classNo) && grade >= 1 && grade <= 6 && classNo >= 1 && classNo <= 20)) throw new HttpsError("invalid-argument", "담임 학년·반을 확인하세요.");
    Object.assign(out, { homeroom: true, grade, classNo });
  }
  if (input.subject) {
    if (!Array.isArray(input.subject.grades) || input.subject.grades.some((g) => !Number.isInteger(g) || g < 1 || g > 6)) throw new HttpsError("invalid-argument", "전담 학년을 확인하세요.");
    const grades = [...new Set(input.subject.grades)].sort((a, b) => a - b);
    const programs = (input.subject.programs ?? []).map(String).filter((p) => /^[\w-]{1,40}$/.test(p));
    // 담당 항목은 비어도 됨: 학교에 인증 항목이 생기면 [내 역할]에서 고름
    if (!grades.length) throw new HttpsError("invalid-argument", "전담 학년을 고르세요.");
    const classes = input.subject.subjectClasses ?? [];
    if (!Array.isArray(classes) || classes.length > 120 || classes.some((c) => !c || !Number.isInteger(c.grade) || !grades.includes(c.grade) || !Number.isInteger(c.classNo) || c.classNo < 1 || c.classNo > 20)) {
      throw new HttpsError("invalid-argument", "전담 학급은 선택한 학년의 1~20반에서 고르세요.");
    }
    const subjectClasses = classes.filter((c, i) => classes.findIndex((x) => x.grade === c.grade && x.classNo === c.classNo) === i)
      .map((c) => ({ grade: c.grade, classNo: c.classNo })).sort((a, b) => a.grade - b.grade || a.classNo - b.classNo);
    Object.assign(out, { subject: true, grades, programs, subjectClasses });
  }
  // Teaching assignments are optional; certification oversight is granted by an administrator after joining.
  return out;
}

/** 원래 학교 개설자만 관리자가 사라진 학교를 복구할 수 있다. */
export const claimAdmin = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  const { schoolId, check } = (req.data ?? {}) as { schoolId?: string; check?: boolean };
  if (!schoolId || !/^[A-Za-z0-9_-]{2,40}$/.test(schoolId)) throw new HttpsError("invalid-argument", "학교를 선택하세요.");
  const uid = req.auth.uid;
  const ref = db.doc(sp(schoolId, `staff/${uid}`));
  return db.runTransaction(async (tx) => {
    const school = await tx.get(db.doc(sp(schoolId)));
    const me = await tx.get(ref);
    if (!school.exists || school.get("status") !== "active" || !me.exists || me.get("status") !== "active") {
      throw new HttpsError("permission-denied", "승인된 교사만 할 수 있어요.");
    }
    const admins = await tx.get(db.collection(sp(schoolId, "staff")).where("role", "==", "admin").where("status", "==", "active").limit(1));
    const hasAdmin = !admins.empty;
    const canClaim = school.get("createdBy") === uid && !hasAdmin;
    if (check) return { hasAdmin, canClaim };
    if (!canClaim) throw new HttpsError("permission-denied", "최초 학교 개설자만 관리자 권한을 복구할 수 있어요. 관리자나 플랫폼 운영자에게 요청하세요.");
    tx.update(ref, { role: "admin", updatedAt: FieldValue.serverTimestamp() });
    return { hasAdmin: true, canClaim: false, claimed: true };
  });
});

/** 클라이언트가 보낸 학교를 NEIS에서 코드로 재조회하여 공식 정보만 저장한다. */
async function verifyNewSchool(neis: NeisSchool): Promise<NeisSchool> {
  let schools: NeisSchool[];
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    schools = EMULATOR_SCHOOLS;
  } else {
    const url = new URL("https://open.neis.go.kr/hub/schoolInfo");
    url.searchParams.set("KEY", NEIS_API_KEY.value());
    url.searchParams.set("Type", "json");
    url.searchParams.set("pSize", "10");
    url.searchParams.set("SD_SCHUL_CODE", neis.schoolCode);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`NEIS HTTP ${res.status}`);
      schools = parseNeisSchoolInfo(await res.json());
    } catch {
      // 요청 URL에 인증키가 있으므로 원본 오류를 로그에 남기지 않는다.
      throw new HttpsError("unavailable", "NEIS 학교 정보를 확인하지 못했어요. 잠시 후 다시 시도하세요.");
    }
  }
  const verified = schools.find((s) => s.schoolCode === neis.schoolCode && s.name === neis.name && s.atptCode === neis.atptCode);
  if (!verified) throw new HttpsError("invalid-argument", "학교 정보가 NEIS와 일치하지 않아요. 학교를 다시 검색해 주세요.");
  return Object.fromEntries(Object.entries(verified).filter(([, v]) => v !== undefined)) as unknown as NeisSchool;
}

/**
 * open 학교는 검증된 Google 계정의 교사 가입을 즉시 허용한다.
 * 기존 학교의 관리자 지정은 해당 학교 관리자에게만 맡긴다.
 * 신규 학교는 개설자만 관리자이며 유료 AI는 플랫폼 승인 전까지 사용하지 않는다.
 */
export const requestJoin = onCall({ region: REGION, secrets: [NEIS_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  const email = String(req.auth.token.email ?? "").toLowerCase();
  if (!email || req.auth.token.email_verified !== true || req.auth.token.firebase?.sign_in_provider !== "google.com") {
    throw new HttpsError("permission-denied", "이메일이 확인된 Google 계정으로 로그인해 주세요.");
  }
  const input = req.data as JoinInput;
  const neis = input?.neis;
  if (!neis?.schoolCode || !neis?.name || !/^[A-Za-z0-9_-]{2,40}$/.test(neis.schoolCode)) throw new HttpsError("invalid-argument", "학교를 선택하세요.");
  const uid = req.auth.uid;
  const schoolId = neis.schoolCode;
  const draft = staffDraft(input, email);
  const schoolRef = db.doc(sp(schoolId));
  const userRef = db.doc(`users/${uid}`);
  const studentRef = db.doc(`studentIndex/${email}`);
  // 외부 조회 전에 이미 소속된 계정을 거절하고, 트랜잭션에서 다시 검사한다.
  const [school, user, student] = await Promise.all([schoolRef.get(), userRef.get(), studentRef.get()]);
  if (student.exists) throw new HttpsError("permission-denied", "학생 계정으로 교사 가입을 할 수 없어요.");
  if (user.get("schoolId") && user.get("schoolId") !== schoolId) throw new HttpsError("failed-precondition", "이미 다른 학교에 소속되어 있어요. 플랫폼 운영자에게 소속 변경을 요청하세요.");
  const verified = school.exists ? null : await verifyNewSchool(neis);
  const ref = db.doc(sp(schoolId, `staff/${uid}`));
  return db.runTransaction(async (tx) => {
    const currentSchool = await tx.get(schoolRef);
    const currentUser = await tx.get(userRef);
    const currentStudent = await tx.get(studentRef);
    const cur = await tx.get(ref);
    if (currentStudent.exists) throw new HttpsError("permission-denied", "학생 계정으로 교사 가입을 할 수 없어요.");
    if (currentUser.get("schoolId") && currentUser.get("schoolId") !== schoolId) throw new HttpsError("failed-precondition", "이미 다른 학교에 소속되어 있어요. 플랫폼 운영자에게 소속 변경을 요청하세요.");
    const created = !currentSchool.exists;
    if (!created && currentSchool.get("status") !== "active") throw new HttpsError("failed-precondition", "현재 가입할 수 없는 학교예요. 플랫폼 운영자에게 문의하세요.");
    if (created && !verified) throw new HttpsError("aborted", "학교 정보가 변경되었어요. 다시 검색해 주세요.");
    if (cur.exists && cur.get("status") === "rejected") throw new HttpsError("permission-denied", "가입이 거절된 계정이에요. 관리자에게 문의하세요.");
    // Rejoining reconnects the account; it must not replace administrator-managed
    // assignments, or preserve a grant while widening its classroom/program scope.
    const grants = cur.get("bulkRecognitionPrograms");
    const certificationGrants = cur.get("certificationPrograms");
    if (!created && cur.exists && (cur.get("status") === "active" || (Array.isArray(grants) && grants.length > 0) || (Array.isArray(certificationGrants) && certificationGrants.length > 0))) {
      tx.set(userRef, { schoolId, email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { status: cur.get("status") === "active" ? "active" : "pending", schoolId, created: false };
    }
    const policy = created ? "open" : (currentSchool.get("joinPolicy") ?? "open");
    const keepAdmin = cur.exists && cur.get("role") === "admin" && cur.get("status") === "active";
    const active = policy === "open" || (cur.exists && cur.get("status") === "active");
    if (created && verified) {
      tx.create(schoolRef, {
        name: verified.name, shortName: shortSchoolName(verified.name), principalName: "", studentDomain: "", year: SCHOOL_YEAR,
        logoUrl: "", sealUrl: "", neis: verified, status: "active", joinPolicy: "open", createdBy: uid,
        aiReviewEnabled: false, createdAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(ref, {
      ...draft, role: created || keepAdmin ? "admin" : "teacher",
      requestedAdmin: Boolean(input.admin) || created,
      status: active ? "active" : "pending",
      createdAt: cur.get("createdAt") ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(userRef, { schoolId, email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { status: active ? "active" : "pending", schoolId, created };
  });
});

/** 운영자: 학교 개설 승인 → 학교 생성 + 신청 교사를 그 학교 관리자로 */
export const approveSchoolRequest = onCall({ region: REGION, secrets: [NEIS_API_KEY] }, async (req) => {
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
  const verified = (await schoolRef.get()).exists ? null : await verifyNewSchool(r.neis);
  const userRef = db.doc(`users/${r.uid}`);
  await db.runTransaction(async (tx) => {
    const request = await tx.get(ref);
    const existing = await tx.get(schoolRef);
    const user = await tx.get(userRef);
    if (request.get("status") !== "pending") throw new HttpsError("failed-precondition", "이미 처리된 신청이에요.");
    if (user.get("schoolId") && user.get("schoolId") !== r.schoolId) throw new HttpsError("failed-precondition", "신청자가 이미 다른 학교에 소속되어 있어요.");
    if (!existing.exists) {
      if (!verified || verified.schoolCode !== r.schoolId) throw new HttpsError("aborted", "학교 정보를 다시 확인해 주세요.");
      tx.create(schoolRef, {
        name: verified.name, shortName: shortSchoolName(verified.name), principalName: "", studentDomain: "", year: SCHOOL_YEAR,
        logoUrl: "", sealUrl: "", neis: verified, status: "active", createdBy: r.uid,
        aiReviewEnabled: false, createdAt: FieldValue.serverTimestamp(),
      });
    } else if (existing.get("status") !== "active") {
      tx.update(schoolRef, { status: "active" });
    }
    tx.set(db.doc(sp(r.schoolId, `staff/${r.uid}`)), { ...r.staff, role: "admin", status: "active", createdAt: FieldValue.serverTimestamp() });
    tx.set(userRef, { schoolId: r.schoolId, email: r.email }, { merge: true });
    tx.update(ref, { status: "approved", decidedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true, schoolId: r.schoolId };
});
