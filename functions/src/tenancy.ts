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
  admin?: boolean; // 학교 담당자
  homeroom?: { grade: number; classNo: number } | null; // 담임
  subject?: { grades: number[]; programs: string[] } | null; // 전담
}

function staffDraft(input: JoinInput, email: string) {
  const name = String(input.name ?? "").trim().slice(0, 30);
  if (!name) throw new HttpsError("invalid-argument", "이름을 입력하세요.");
  const out: Record<string, unknown> = { name, email, homeroom: false, grade: null, classNo: null, subject: false, grades: [], programs: [] };
  if (input.homeroom) {
    const grade = Number(input.homeroom.grade), classNo = Number(input.homeroom.classNo);
    if (!(grade >= 1 && grade <= 6 && classNo >= 1 && classNo <= 20)) throw new HttpsError("invalid-argument", "담임 학년·반을 확인하세요.");
    Object.assign(out, { homeroom: true, grade, classNo });
  }
  if (input.subject) {
    const grades = (input.subject.grades ?? []).map(Number).filter((g) => g >= 1 && g <= 6);
    const programs = (input.subject.programs ?? []).map(String).filter((p) => /^[\w-]{1,40}$/.test(p));
    // 담당 항목은 비어도 됨: 학교에 인증 항목이 생기면 [내 역할]에서 고름
    if (!grades.length) throw new HttpsError("invalid-argument", "전담 학년을 고르세요.");
    Object.assign(out, { subject: true, grades, programs });
  }
  if (!input.admin && !out.homeroom && !out.subject) throw new HttpsError("invalid-argument", "역할을 하나 이상 고르세요.");
  return out;
}

async function hasActiveAdmin(schoolId: string) {
  const snap = await db.collection(sp(schoolId, "staff")).where("role", "==", "admin").where("status", "==", "active").limit(1).get();
  return !snap.empty;
}

/**
 * 대비책: 학교 담당자가 한 명도 없을 때 승인된 교사가 [내 역할]에서 담당자를 맡음
 * check: true 이면 담당자가 있는지만 알려 줌
 */
export const claimAdmin = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  const { schoolId, check } = (req.data ?? {}) as { schoolId?: string; check?: boolean };
  if (!schoolId || !/^[A-Za-z0-9_-]{2,40}$/.test(schoolId)) throw new HttpsError("invalid-argument", "학교를 선택하세요.");
  const ref = db.doc(sp(schoolId, `staff/${req.auth.uid}`));
  const me = await ref.get();
  if (!me.exists || me.get("status") !== "active") throw new HttpsError("permission-denied", "승인된 교사만 할 수 있어요.");
  const has = await hasActiveAdmin(schoolId);
  if (check) return { hasAdmin: has };
  if (has) throw new HttpsError("failed-precondition", "이미 학교 담당자가 있어요. 담당자에게 지정을 요청하세요.");
  await ref.update({ role: "admin", updatedAt: FieldValue.serverTimestamp() });
  return { hasAdmin: true, claimed: true };
});

/**
 * 교사·학교 담당자 가입 (역할은 겹쳐서 선택 가능)
 * - 학교 가입 방식(joinPolicy)이 'open'(기본)이면 바로 사용, 'approval'이면 학교 담당자 승인 대기
 * - 아직 없는 학교는 그 자리에서 개설되고, 신청자가 학교 담당자가 된다
 */
export const requestJoin = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  const input = req.data as JoinInput;
  const neis = input?.neis;
  if (!neis?.schoolCode || !neis?.name || !/^[A-Za-z0-9_-]{2,40}$/.test(neis.schoolCode)) throw new HttpsError("invalid-argument", "학교를 선택하세요.");
  const email = String(req.auth.token.email ?? "").toLowerCase();
  const uid = req.auth.uid;
  const schoolId = neis.schoolCode;
  const draft = staffDraft(input, email);
  const schoolRef = db.doc(sp(schoolId));
  const school = await schoolRef.get();
  let created = false;
  if (!school.exists) {
    await schoolRef.set({
      name: neis.name, shortName: shortSchoolName(neis.name), principalName: "", studentDomain: "", year: SCHOOL_YEAR,
      logoUrl: "", sealUrl: "", neis: { ...neis }, status: "active", joinPolicy: "open", createdBy: uid, createdAt: FieldValue.serverTimestamp(),
    });
    created = true;
  }
  const policy = created ? "open" : (school.get("joinPolicy") ?? "open");
  const ref = db.doc(sp(schoolId, `staff/${uid}`));
  const cur = await ref.get();
  const keepAdmin = cur.exists && cur.get("role") === "admin" && cur.get("status") === "active";
  const wantsAdmin = Boolean(input.admin) || created;
  // 대비책: 학교 담당자가 한 명도 없으면 담당자를 신청한 교사가 바로 담당자 (승인해 줄 사람이 없으므로)
  const noAdmin = !created && !(await hasActiveAdmin(schoolId));
  const claim = wantsAdmin && noAdmin;
  const active = policy === "open" || claim || (cur.exists && cur.get("status") === "active");
  await ref.set(
    {
      ...draft,
      role: keepAdmin || claim || (wantsAdmin && (policy === "open" || created)) ? "admin" : "teacher",
      requestedAdmin: wantsAdmin,
      status: active ? "active" : "pending",
      createdAt: cur.get("createdAt") ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await db.doc(`users/${uid}`).set({ schoolId, email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { status: active ? "active" : "pending", schoolId, created };
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
