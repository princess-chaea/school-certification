import { createHash, randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, FieldValue, loadConfig, REGION, requireSchoolId, sp } from "./common.js";
import { taskSetIds } from "./shared/domain.js";
import task1 from "./shared/data/task1-cartoon.json" with { type: "json" };
import task3g4 from "./shared/data/task3-grade4.json" with { type: "json" };
import task3g5 from "./shared/data/task3-grade5.json" with { type: "json" };
import task3g6 from "./shared/data/task3-grade6.json" with { type: "json" };

const bundledSets = [task1, task3g4, task3g5, task3g6];

const fileTypes = new Set([
  "application/pdf", "application/haansofthwp", "application/x-hwp", "application/hwp",
  "application/vnd.hancom.hwp", "application/vnd.hancom.hwpx", "application/octet-stream",
  "video/mp4", "video/webm", "video/quicktime", "image/jpeg", "image/png", "image/webp",
]);

export function uploadFormat(kind: unknown, contentType: unknown) {
  if (typeof contentType !== "string" || contentType.length > 100) throw new HttpsError("invalid-argument", "파일 형식을 확인해 주세요.");
  if (kind === "photo" && contentType === "image/jpeg") return { extension: "jpg", maxBytes: 5 * 1024 * 1024 };
  if ((kind === "audio" || kind === "sentenceAudio") && /^audio\/(webm|ogg|mp4|mpeg|wav)(;codecs=[a-zA-Z0-9., -]+)?$/.test(contentType)) {
    return { extension: contentType.includes("mp4") ? "m4a" : contentType.includes("ogg") ? "ogg" : contentType.includes("mpeg") ? "mp3" : contentType.includes("wav") ? "wav" : "webm", maxBytes: 10 * 1024 * 1024 };
  }
  if (kind === "file" && fileTypes.has(contentType)) return { extension: "bin", maxBytes: 10 * 1024 * 1024 };
  throw new HttpsError("invalid-argument", "지원하지 않는 파일 형식이에요.");
}

export function nextUploadTimes(value: unknown, now: number): number[] {
  const recent = Array.isArray(value) ? value.filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > now - 3600_000) : [];
  if (recent.length >= 150 || recent.filter((x) => x > now - 600_000).length >= 60) {
    throw new HttpsError("resource-exhausted", "짧은 시간에 파일을 많이 올렸어요. 잠시 뒤 다시 올려 주세요.");
  }
  return [...recent, now];
}

/** Each immutable ticket permits exactly one object creation, never an overwrite. */
export const issueUploadTicket = onCall({ region: REGION, maxInstances: 5, concurrency: 20, timeoutSeconds: 30 }, async (req) => {
  if (!req.auth || req.auth.token.email_verified !== true) throw new HttpsError("unauthenticated", "학교 계정으로 다시 로그인해 주세요.");
  const email = String(req.auth.token.email ?? "").toLowerCase();
  if (!email || email.includes("/")) throw new HttpsError("unauthenticated", "학교 계정을 확인해 주세요.");
  const data = (req.data ?? {}) as Record<string, unknown>;
  const schoolId = requireSchoolId(data);
  const programId = data?.program;
  if (typeof programId !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(programId)) throw new HttpsError("invalid-argument", "인증 항목을 확인해 주세요.");
  const format = uploadFormat(data.kind, data.contentType);
  const indexRef = db.doc(`studentIndex/${email}`);
  const index = await indexRef.get();
  const sid = index.get("sid");
  if (index.get("schoolId") !== schoolId || sid !== email) throw new HttpsError("permission-denied", "학교 학생 명단을 확인해 주세요.");
  const program = (await loadConfig(schoolId)).programs.find((p) => p.id === programId);
  const task = program?.tasks?.find((t) => t.id === data.task);
  const sentenceAudio = data.kind === "sentenceAudio";
  if (!program?.enabled || (program.kind === "tasks" ? !task || task.kind !== (sentenceAudio ? "sentences" : "evidence") : !!data.task || sentenceAudio)) throw new HttpsError("permission-denied", "참여할 수 없는 인증 항목이에요.");
  const evidence = task ? task.evidence ?? ["photo"] : program.evidence;
  if (!sentenceAudio && !evidence.includes(data.kind as "photo" | "file" | "audio")) throw new HttpsError("invalid-argument", "이 항목에서 받지 않는 증빙이에요.");
  if (sentenceAudio && (typeof data.setId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(data.setId) || !Number.isInteger(data.no) || Number(data.no) < 1)) throw new HttpsError("invalid-argument", "연습 문장을 확인해 주세요.");
  const studentRef = db.doc(sp(schoolId, `students/${sid}`));
  const schoolRef = db.doc(sp(schoolId));
  const rateRef = db.doc(sp(schoolId, `uploadLimits/${createHash("sha256").update(sid).digest("hex")}`));
  // Suffix cannot match the legacy sentence-audio overwrite rule's `-<number>`.
  const ticketId = `${randomUUID()}_ticket.${format.extension}`;
  const path = `schools/${schoolId}/uploads/${sid}/${programId}/${ticketId}`;
  const ticketRef = db.doc(sp(schoolId, `uploadTickets/${ticketId}`));
  return db.runTransaction(async (tx) => {
    const [student, school, freshIndex, rate] = await tx.getAll(studentRef, schoolRef, indexRef, rateRef);
    if (!student.exists || student.get("active") !== true || String(student.get("email")).toLowerCase() !== email
      || school.get("status") !== "active" || student.get("year") !== school.get("year")
      || freshIndex.get("schoolId") !== schoolId || freshIndex.get("sid") !== sid || freshIndex.get("year") !== school.get("year")
      || !program.grades.includes(student.get("grade"))) throw new HttpsError("permission-denied", "현재 학교 학생 명단을 확인해 주세요.");
    if (sentenceAudio) {
      if (!taskSetIds(task!, student.get("grade")).includes(data.setId as string)) throw new HttpsError("permission-denied", "참여할 수 없는 문장 세트예요.");
      const set = await tx.get(db.doc(sp(schoolId, `sentenceSets/${data.setId}`)));
      const items = set.exists ? set.get("items") : bundledSets.find((s) => s.setId === data.setId)?.items;
      if (!Array.isArray(items) || !items.some((item: { no?: unknown }) => item?.no === data.no)) throw new HttpsError("invalid-argument", "연습 문장을 찾을 수 없어요.");
    }
    const now = Date.now();
    const times = nextUploadTimes(rate.get("times"), now);
    const expiresAt = now + 15 * 60_000;
    tx.create(ticketRef, { uid: req.auth!.uid, sid, program: programId, path, kind: data.kind, contentType: data.contentType, maxBytes: format.maxBytes, expiresAt: Timestamp.fromMillis(expiresAt), createdAt: FieldValue.serverTimestamp() });
    tx.set(rateRef, { times, updatedAt: FieldValue.serverTimestamp() });
    return { ticketId, path, expiresAt, maxBytes: format.maxBytes };
  });
});
