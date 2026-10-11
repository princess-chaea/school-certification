import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, FieldValue, REGION, requireSchoolId, sp } from "./common.js";

/** Role, membership status and deletion share one transaction, including caller authorization. */
export const manageStaff = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  const schoolId = requireSchoolId(req.data);
  const { staffId, action, value } = req.data ?? {};
  if (typeof staffId !== "string" || !staffId || staffId.length > 128 || staffId.includes("/")
      || !["role", "status", "delete"].includes(action)
      || (action === "role" && !["admin", "teacher"].includes(value))
      || (action === "status" && !["active", "pending", "rejected"].includes(value))) {
    throw new HttpsError("invalid-argument", "변경할 구성원 정보를 확인해 주세요.");
  }
  const uid = req.auth.uid;
  return db.runTransaction(async (tx) => {
    const lock = db.doc(sp(schoolId, "_internal/staffManagement"));
    // Serialize all membership mutations even when administrators target different staff documents.
    await tx.get(lock);
    const superAdmin = await tx.get(db.doc(`superAdmins/${uid}`));
    const caller = await tx.get(db.doc(sp(schoolId, `staff/${uid}`)));
    if (!superAdmin.exists && (caller.get("role") !== "admin" || caller.get("status") !== "active")) {
      throw new HttpsError("permission-denied", "관리자만 구성원을 변경할 수 있어요.");
    }
    const targetRef = db.doc(sp(schoolId, `staff/${staffId}`));
    const target = await tx.get(targetRef);
    if (!target.exists) throw new HttpsError("not-found", "구성원을 찾을 수 없어요.");
    const removesActiveAdmin = target.get("role") === "admin" && target.get("status") === "active"
      && (action === "delete" || (action === "role" && value !== "admin") || (action === "status" && value !== "active"));
    if (removesActiveAdmin) {
      const admins = await tx.get(db.collection(sp(schoolId, "staff")).where("role", "==", "admin"));
      if (!admins.docs.some((doc) => doc.id !== staffId && doc.get("status") === "active")) {
        throw new HttpsError("failed-precondition", "관리자는 최소 1명 있어야 해요. 먼저 다른 선생님을 관리자로 지정해 주세요.");
      }
    }
    if (action === "delete") tx.delete(targetRef);
    else tx.update(targetRef, { [action]: value, updatedAt: FieldValue.serverTimestamp() });
    tx.set(lock, { updatedAt: FieldValue.serverTimestamp() });
    return { ok: true };
  });
});
