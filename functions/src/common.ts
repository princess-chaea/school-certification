import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { DEFAULT_CONFIG, mergeConfig, type AppConfig } from "./shared/domain.js";
import { mergeSchool, type SchoolInfo } from "./shared/school.js";

initializeApp();
export const db = getFirestore();
export { FieldValue };
export const REGION = "asia-northeast3";
setGlobalOptions({ region: REGION, maxInstances: 10 });

/** schools/{schoolId}/... 경로 */
export const sp = (schoolId: string, path = "") => (path ? `schools/${schoolId}/${path}` : `schools/${schoolId}`);

export function requireSchoolId(data: unknown): string {
  const id = String((data as { schoolId?: string })?.schoolId ?? "").trim();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(id)) throw new HttpsError("invalid-argument", "학교 정보가 없어요.");
  return id;
}

const configCache = new Map<string, { at: number; value: AppConfig }>();
export async function loadConfig(schoolId: string): Promise<AppConfig> {
  const hit = configCache.get(schoolId);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const snap = await db.doc(sp(schoolId, "config/app")).get();
  const merged = snap.exists ? mergeConfig(snap.data() as Partial<AppConfig>) : DEFAULT_CONFIG;
  // AI 모델·하루 상한은 학교가 아니라 서버 관리자가 정함: 코드 기본값 + platform/settings.ai (Firebase 콘솔에서 수정)
  const platform = await db.doc("platform/settings").get();
  const value = { ...merged, ai: { ...DEFAULT_CONFIG.ai, ...((platform.get("ai") as Partial<AppConfig["ai"]>) ?? {}) } };
  configCache.set(schoolId, { at: Date.now(), value });
  return value;
}

export async function loadSchool(schoolId: string): Promise<SchoolInfo & { status?: string }> {
  const snap = await db.doc(sp(schoolId)).get();
  if (!snap.exists) throw new HttpsError("not-found", "학교를 찾을 수 없어요.");
  return { ...mergeSchool(snap.data() as Partial<SchoolInfo>), status: snap.get("status") };
}

export interface StaffDoc {
  role: "teacher" | "admin"; // admin = 학교 담당자
  status: "pending" | "active" | "rejected";
  name?: string;
  homeroom?: boolean; // 담임
  grade?: number | null;
  classNo?: number | null;
  subject?: boolean; // 전담
  grades?: number[];
  programs?: string[];
}

export async function isSuper(uid?: string) {
  if (!uid) return false;
  return (await db.doc(`superAdmins/${uid}`).get()).exists;
}

export async function requireSuper(req: CallableRequest) {
  if (!req.auth || !(await isSuper(req.auth.uid))) throw new HttpsError("permission-denied", "플랫폼 운영자만 사용할 수 있어요.");
}

/** 그 학교의 승인된 교사(또는 관리자, 플랫폼 운영자) */
export async function requireStaff(req: CallableRequest, schoolId: string, adminOnly = false): Promise<StaffDoc & { uid: string }> {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  if (await isSuper(req.auth.uid)) return { role: "admin", status: "active", name: "플랫폼 운영자", uid: req.auth.uid };
  const snap = await db.doc(sp(schoolId, `staff/${req.auth.uid}`)).get();
  const u = snap.data() as StaffDoc | undefined;
  if (!u || u.status !== "active") throw new HttpsError("permission-denied", "승인된 교사만 사용할 수 있습니다.");
  if (adminOnly && u.role !== "admin") throw new HttpsError("permission-denied", "관리자만 사용할 수 있습니다.");
  return { ...u, uid: req.auth.uid };
}


export function todayKey() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // KST 날짜
}
