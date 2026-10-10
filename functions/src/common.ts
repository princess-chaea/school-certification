import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { DEFAULT_CONFIG, mergeConfig, type AppConfig } from "./shared/domain.js";

initializeApp();
export const db = getFirestore();
export { FieldValue };
export const REGION = "asia-northeast3";
setGlobalOptions({ region: REGION, maxInstances: 10 });

let cachedConfig: { at: number; value: AppConfig } | null = null;
export async function loadConfig(): Promise<AppConfig> {
  if (cachedConfig && Date.now() - cachedConfig.at < 60_000) return cachedConfig.value;
  const snap = await db.doc("config/app").get();
  const value = snap.exists ? mergeConfig(snap.data() as Partial<AppConfig>) : DEFAULT_CONFIG;
  cachedConfig = { at: Date.now(), value };
  return value;
}

export interface StaffDoc {
  role: "teacher" | "admin";
  status: "pending" | "active" | "rejected";
  name?: string;
  teacherType?: "homeroom" | "subject";
  grade?: number;
  classNo?: number;
  grades?: number[];
  programs?: string[];
}

export async function requireStaff(req: CallableRequest, adminOnly = false): Promise<StaffDoc & { uid: string }> {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const snap = await db.doc(`users/${req.auth.uid}`).get();
  const u = snap.data() as StaffDoc | undefined;
  if (!u || u.status !== "active") throw new HttpsError("permission-denied", "승인된 교사만 사용할 수 있습니다.");
  if (adminOnly && u.role !== "admin") throw new HttpsError("permission-denied", "관리자만 사용할 수 있습니다.");
  return { ...u, uid: req.auth.uid };
}

export function staffCanSeeStudent(u: StaffDoc, s: { grade: number; classNo: number }) {
  if (u.role === "admin") return true;
  if (u.teacherType === "homeroom") return u.grade === s.grade && u.classNo === s.classNo;
  if (u.teacherType === "subject") return (u.grades ?? []).includes(s.grade);
  return false;
}

export function todayKey() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // KST 날짜
}
