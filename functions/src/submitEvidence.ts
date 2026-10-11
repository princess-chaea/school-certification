import { createHash } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, FieldValue, loadConfig, REGION, requireSchoolId, sp, todayKey } from "./common.js";
import { validateEvidence, type ProgramDef } from "./shared/domain.js";

const digest = (...parts: string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const invalid = (message: string): never => { throw new HttpsError("invalid-argument", message); };
function string(value: unknown, max: number, name: string, required = false): string {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) invalid(`${name}을 확인해 주세요.`);
  return (value as string).trim();
}

/** Pure input validation shared by the callable's authenticated execution and focused tests. */
export function validatedEvidence(data: Record<string, unknown>, program: ProgramDef, grade: number, today: string) {
  if (!program.enabled || !program.grades.includes(grade)) invalid("참여할 수 없는 인증 항목이에요.");
  const taskId = string(data.task, 40, "과제");
  const task = program.tasks?.find((t) => t.id === taskId);
  if (program.kind === "tasks" ? !task || task.kind !== "evidence" : !!taskId) invalid("과제를 확인해 주세요.");
  const spec = task ? { evidence: task.evidence ?? ["photo" as const], required: task.required ?? ["photo" as const], fields: task.fields, minAudioSec: task.minAudioSec } : program;
  const activityDate = string(data.activityDate, 10, "활동 날짜", true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDate) || !Number.isFinite(Date.parse(activityDate)) || new Date(activityDate).toISOString().slice(0, 10) !== activityDate || activityDate > today) invalid("활동 날짜를 확인해 주세요.");
  const text = string(data.text, 2000, "소감");
  const link = string(data.link, 2000, "링크");
  const activityType = string(data.activityType, 100, "활동 종류");
  if (activityType && (!('choices' in spec) || !spec.choices?.includes(activityType))) invalid("활동 종류를 확인해 주세요.");
  if (data.fields !== undefined && (!data.fields || typeof data.fields !== "object" || Array.isArray(data.fields))) invalid("추가 입력 내용을 확인해 주세요.");
  const rawFields = (data.fields ?? {}) as Record<string, unknown>;
  const allowedFields = new Set((spec.fields ?? []).map((f) => f.key));
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawFields)) {
    if (!allowedFields.has(key)) invalid("허용되지 않은 추가 입력 항목이에요.");
    fields[key] = string(value, 500, "추가 입력 내용");
  }
  const photoPath = string(data.photoPath, 500, "사진 경로");
  const filePath = string(data.filePath, 500, "파일 경로");
  const audioPath = string(data.audioPath, 500, "녹음 경로");
  for (const [kind, present] of [["photo", !!photoPath], ["file", !!filePath], ["audio", !!audioPath], ["text", !!text], ["link", !!link]] as const) {
    if (present && !spec.evidence.includes(kind)) invalid("이 항목에서 받지 않는 증빙이에요.");
  }
  const durationSec = data.durationSec;
  if (audioPath && (typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 480)) invalid("녹음 길이를 확인해 주세요.");
  if (!audioPath && durationSec !== undefined) invalid("녹음 파일이 없어요.");
  const error = validateEvidence(spec, { photo: !!photoPath, file: !!filePath, audioSec: audioPath ? durationSec as number : undefined, text, link, fields, choice: activityType });
  if (error) invalid(error);
  if (!photoPath && !filePath && !audioPath && !text && !link && !Object.values(fields).some(Boolean)) invalid("증빙 내용을 넣어 주세요.");
  const result: Record<string, unknown> = { program: program.id, ...(taskId ? { task: taskId } : {}), activityDate, fields };
  for (const [key, value] of Object.entries({ text, link, activityType, photoPath, filePath, audioPath })) if (value) result[key] = value;
  if (filePath) result.fileName = string(data.fileName, 255, "파일 이름", true);
  if (audioPath) result.durationSec = durationSec;
  const hash = string(data.hash, 16, "사진 정보");
  if (photoPath && /^[a-f0-9]{16}$/.test(hash)) result.hash = hash;
  if (audioPath && data.audioCheck && typeof data.audioCheck === "object") {
    const check = data.audioCheck as Record<string, unknown>;
    if (typeof check.durationSec === "number" && Number.isFinite(check.durationSec) && check.durationSec > 0 && check.durationSec <= 480 && typeof check.voicedRatio === "number" && Number.isFinite(check.voicedRatio) && check.voicedRatio >= 0 && check.voicedRatio <= 1) result.audioCheck = { durationSec: check.durationSec, voicedRatio: check.voicedRatio };
  }
  return result;
}

export function recentSubmissionTimes(times: unknown, now: number): number[] {
  const recent = Array.isArray(times) ? times.filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > now - 3600_000) : [];
  if (recent.length >= 120 || recent.filter((x) => x > now - 600_000).length >= 40) throw new HttpsError("resource-exhausted", "짧은 시간에 많은 기록을 올렸어요. 잠시 뒤 다시 올려 주세요.");
  return [...recent, now];
}

/** A removed record can be corrected and submitted again with a new item ID. */
export function photoSubmissionBlocksRetry(submission: { exists: boolean; get(field: string): unknown }): boolean {
  return submission.exists && submission.get("status") !== "deleted";
}

/** Content identity excludes upload names and item IDs, while preserving activity dates. */
export function evidenceContentFingerprint(evidence: Record<string, unknown>, mediaHashes: Partial<Record<"filePath" | "audioPath", string>> = {}): string {
  const normalize = (value: unknown) => typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : "";
  const fields = Object.entries((evidence.fields ?? {}) as Record<string, unknown>)
    .map(([key, value]) => [key, normalize(value)]).filter(([, value]) => value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return digest(
    ...["program", "task", "activityDate", "text", "link", "activityType"].map((key) => normalize(evidence[key])),
    JSON.stringify(fields),
    ...(["filePath", "audioPath"] as const).map((key) => evidence[key] ? `${key}:${mediaHashes[key] ? `md5:${mediaHashes[key]}` : `path:${evidence[key]}`}` : ""),
  );
}

// App Check enforcement requires the deployed PWA to obtain valid tokens first.
// Authentication, roster authorization and transaction guards are mandatory now.
export const submitEvidence = onCall({ region: REGION, maxInstances: 5, concurrency: 20, timeoutSeconds: 60 }, async (req) => {
  if (!req.auth || req.auth.token.email_verified !== true) throw new HttpsError("unauthenticated", "학교 계정으로 다시 로그인해 주세요.");
  const email = String(req.auth.token.email ?? "").toLowerCase();
  if (!email || email.includes("/")) throw new HttpsError("unauthenticated", "학교 계정을 확인해 주세요.");
  const data = (req.data ?? {}) as Record<string, unknown>;
  const schoolId = requireSchoolId(data);
  const itemId = string(data?.itemId, 100, "기록 번호", true);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(itemId)) invalid("기록 번호를 확인해 주세요.");
  const indexRef = db.doc(`studentIndex/${email}`);
  const index = await indexRef.get();
  const sid = index.get("sid");
  if (index.get("schoolId") !== schoolId || typeof sid !== "string" || !sid || sid.includes("/")) throw new HttpsError("permission-denied", "학교 학생 명단을 확인해 주세요.");
  const studentRef = db.doc(sp(schoolId, `students/${sid}`));
  const schoolRef = db.doc(sp(schoolId));
  const [student, school] = await Promise.all([studentRef.get(), schoolRef.get()]);
  const authorized = (s: typeof student, schoolDoc: typeof school, idx: typeof index) => s.exists && s.get("active") === true && String(s.get("email")).toLowerCase() === email && idx.get("sid") === sid && idx.get("schoolId") === schoolId && s.get("year") === schoolDoc.get("year") && idx.get("year") === schoolDoc.get("year") && schoolDoc.get("status") === "active";
  if (!authorized(student, school, index)) throw new HttpsError("permission-denied", "현재 학교 학생 명단을 확인해 주세요.");
  const submissionRef = db.doc(sp(schoolId, `submissions/student_${digest(sid, itemId)}`));
  const existing = await submissionRef.get();
  if (existing.exists) return { id: existing.id, existing: true };
  const programId = string(data.program, 40, "인증 항목", true);
  const program = (await loadConfig(schoolId)).programs.find((p) => p.id === programId);
  if (!program) invalid("인증 항목을 찾을 수 없어요.");
  const evidence = validatedEvidence(data, program!, student.get("grade"), todayKey());
  const rateRef = db.doc(sp(schoolId, `submissionLimits/${digest(sid)}`));
  recentSubmissionTimes((await rateRef.get()).get("times"), Date.now());
  let photoMd5 = "";
  const mediaHashes: Partial<Record<"filePath" | "audioPath", string>> = {};
  for (const key of ["photoPath", "filePath", "audioPath"] as const) {
    const path = evidence[key] as string | undefined;
    if (!path) continue;
    const prefix = `schools/${schoolId}/uploads/${sid}/${programId}/`;
    if (!path.startsWith(prefix) || !path.slice(prefix.length) || path.slice(prefix.length).includes("/") || path.includes("..")) invalid("본인이 올린 증빙 파일만 사용할 수 있어요.");
    let meta;
    try { [meta] = await getStorage().bucket().file(path).getMetadata(); }
    catch { throw new HttpsError("failed-precondition", "증빙 파일을 찾을 수 없어요. 다시 올려 주세요."); }
    const size = Number(meta.size);
    const type = String(meta.contentType ?? "");
    if (!Number.isFinite(size) || size <= 0 || size > (key === "photoPath" ? 5 : 10) * 1024 * 1024) invalid("증빙 파일 크기를 확인해 주세요.");
    if (key === "photoPath") {
      if (type !== "image/jpeg" || !meta.md5Hash) invalid("사진 형식을 확인해 주세요.");
      evidence.photoType = type;
      photoMd5 = meta.md5Hash!;
    }
    if (key === "audioPath" && !/^audio\/(webm|ogg|mp4|mpeg|wav)(;|$)/.test(type)) invalid("녹음 형식을 확인해 주세요.");
    if (key !== "photoPath" && meta.md5Hash) mediaHashes[key] = meta.md5Hash;
  }
  const duplicateRef = photoMd5
    ? db.doc(sp(schoolId, `submissionPhotos/${digest(sid, String(student.get("year")), programId, String(evidence.task ?? ""), photoMd5)}`))
    : db.doc(sp(schoolId, `submissionContent/${digest(sid, String(student.get("year")), evidenceContentFingerprint(evidence, mediaHashes))}`));
  return db.runTransaction(async (tx) => {
    const [saved, freshStudent, freshSchool, freshIndex, rate] = await tx.getAll(submissionRef, studentRef, schoolRef, indexRef, rateRef);
    if (!authorized(freshStudent, freshSchool, freshIndex)) throw new HttpsError("permission-denied", "현재 학교 학생 명단을 확인해 주세요.");
    if (saved.exists) return { id: saved.id, existing: true };
    validatedEvidence(data, program!, freshStudent.get("grade"), todayKey());
    {
      const duplicate = await tx.get(duplicateRef);
      const previousId = duplicate.get("submissionId");
      if (duplicate.exists && typeof previousId === "string" && previousId && !previousId.includes("/")) {
        const previous = await tx.get(db.doc(sp(schoolId, `submissions/${previousId}`)));
        if (photoSubmissionBlocksRetry(previous)) return { id: previousId, existing: true, duplicate: true };
      }
    }
    const times = recentSubmissionTimes(rate.get("times"), Date.now());
    tx.create(submissionRef, { ...evidence, sid, year: freshStudent.get("year"), grade: freshStudent.get("grade"), classNo: freshStudent.get("classNo"), serverValidated: true, source: "student", status: "pending", count: 1, createdAt: FieldValue.serverTimestamp() });
    tx.set(rateRef, { times, updatedAt: FieldValue.serverTimestamp() });
    tx.set(duplicateRef, { submissionId: submissionRef.id, createdAt: FieldValue.serverTimestamp() });
    return { id: submissionRef.id, existing: false };
  });
});
