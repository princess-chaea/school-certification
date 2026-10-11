import { createHash } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, FieldValue, loadConfig, REGION, requireSchoolId, sp } from "./common.js";
import { taskSetIds } from "./shared/domain.js";
import { englishItemId } from "./shared/roster.js";
import { isCorrectAnswer } from "./shared/typing.js";
import { recentSubmissionTimes } from "./submitEvidence.js";
import task1 from "./shared/data/task1-cartoon.json" with { type: "json" };
import task3g4 from "./shared/data/task3-grade4.json" with { type: "json" };
import task3g5 from "./shared/data/task3-grade5.json" with { type: "json" };
import task3g6 from "./shared/data/task3-grade6.json" with { type: "json" };

const sets = [task1, task3g4, task3g5, task3g6];
type Sentence = { no: number; type?: string; en: string; alternatives?: string[] };
type Round = { typedOk: boolean; audioPath: string; [key: string]: unknown };
type Saved = { status?: string; rounds?: Round[]; custom?: { en: string; ko: string } };
const reject = (message: string): never => { throw new HttpsError("failed-precondition", message); };
export function sentenceRequestTimes(value: unknown, now: number): number[] {
  const times = Array.isArray(value) ? value.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > now - 600_000) : [];
  if (times.length >= 150) throw new HttpsError("resource-exhausted", "잠시 뒤 다시 검사 요청해 주세요.");
  return [...times, now];
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new HttpsError("invalid-argument", "입력 내용을 확인해 주세요.");
  return value.trim();
}

/** Returns only server-owned fields; callers cannot set identity, status or arbitrary rounds. */
export function sentenceChange(data: Record<string, unknown>, sentence: Sentence, saved: Saved, now: number): Record<string, unknown> | null {
  const rounds = saved.rounds ?? [];
  if (data.action === "request") {
    if (saved.status === "requested" || saved.status === "checked") return null;
    if (saved.status !== "ready" || rounds.filter((r) => r.typedOk && r.audioPath).length < 3) reject("문장을 세 번 연습한 뒤 검사 요청해 주세요.");
    return { status: "requested", requestedAt: FieldValue.serverTimestamp() };
  }
  if (data.action === "custom") {
    if (sentence.type !== "student") reject("직접 작성하는 문장이 아니에요.");
    const en = text(data.en, 500), ko = text(data.ko, 500);
    if (en.split(/\s+/).length < 2) reject("영어 문장을 적어 주세요.");
    if (saved.custom) {
      if (saved.custom.en === en && saved.custom.ko === ko) return null;
      reject("이미 연습을 시작한 문장이에요.");
    }
    if (saved.status && saved.status !== "new") reject("이미 연습을 시작한 문장이에요.");
    return { custom: { en, ko }, rounds: [], status: "practicing" };
  }
  if (data.action !== "round") throw new HttpsError("invalid-argument", "저장 작업을 확인해 주세요.");
  const audioPath = text(data.audioPath, 500);
  if (rounds.some((r) => r.audioPath === audioPath)) return null;
  if (["checked", "requested", "ready"].includes(saved.status ?? "")) reject("이미 연습을 마친 문장이에요.");
  if (rounds.length >= 3 && saved.status !== "retry") reject("검사를 요청해 주세요.");
  if (rounds.length >= 20) reject("연습 기록이 많아요. 선생님께 기존 녹음으로 확인을 요청해 주세요.");
  const target = sentence.type === "student" ? saved.custom?.en : sentence.en;
  if (!target || !isCorrectAnswer(text(data.typed, 500), target, sentence.type === "student" ? [] : sentence.alternatives ?? [])) reject("문장을 다시 입력해 주세요.");
  if (!Number.isInteger(data.attempts) || Number(data.attempts) < 1 || Number(data.attempts) > 1000
    || typeof data.durationMs !== "number" || !Number.isFinite(data.durationMs) || data.durationMs < 1000 || data.durationMs > 35_000) reject("녹음과 연습 횟수를 확인해 주세요.");
  const round: Round = { typedOk: true, attempts: data.attempts, audioPath, durationMs: data.durationMs, at: now };
  if (data.sttText) round.sttText = text(data.sttText, 1000);
  // Preserve earlier evidence and bound the document instead of discarding old recordings.
  const next = [...rounds, round];
  return { rounds: next, status: saved.status === "retry" || next.length >= 3 ? "ready" : "practicing" };
}

export const saveSentencePractice = onCall({ region: REGION, maxInstances: 5, concurrency: 20, timeoutSeconds: 60 }, async (req) => {
  if (!req.auth || req.auth.token.email_verified !== true) throw new HttpsError("unauthenticated", "학교 계정으로 다시 로그인해 주세요.");
  const email = String(req.auth.token.email ?? "").toLowerCase();
  if (!email || email.includes("/")) throw new HttpsError("unauthenticated", "학교 계정을 확인해 주세요.");
  const data = (req.data ?? {}) as Record<string, unknown>;
  const schoolId = requireSchoolId(data);
  const programId = text(data.program, 40), taskId = text(data.task, 40), setId = text(data.setId, 80);
  if (![programId, taskId, setId].every((v) => /^[A-Za-z0-9_-]+$/.test(v)) || !Number.isInteger(data.no) || Number(data.no) < 1) throw new HttpsError("invalid-argument", "연습 문장을 확인해 주세요.");
  const program = (await loadConfig(schoolId)).programs.find((p) => p.id === programId);
  const task = program?.tasks?.find((t) => t.id === taskId);
  if (!program?.enabled || program.kind !== "tasks" || task?.kind !== "sentences") throw new HttpsError("permission-denied", "참여할 수 없는 과제예요.");
  const studentRef = db.doc(sp(schoolId, `students/${email}`));
  const indexRef = db.doc(`studentIndex/${email}`);
  const schoolRef = db.doc(sp(schoolId));
  const rateRef = db.doc(sp(schoolId, `sentenceLimits/${createHash("sha256").update(email).digest("hex")}`));
  let ticketRef: ReturnType<typeof db.doc> | undefined;
  if (data.action === "round") {
    const path = text(data.audioPath, 500);
    const prefix = `schools/${schoolId}/uploads/${email}/${programId}/`;
    const name = path.slice(prefix.length);
    if (!path.startsWith(prefix) || !name || name.includes("/") || name.includes("..")) reject("본인의 녹음만 사용할 수 있어요.");
    ticketRef = db.doc(sp(schoolId, `uploadTickets/${name}`));
    const ticket = await ticketRef.get();
    if (ticket.get("uid") !== req.auth.uid || ticket.get("kind") !== "sentenceAudio" || ticket.get("path") !== path) reject("녹음 업로드 정보를 확인해 주세요.");
    let meta;
    try { [meta] = await getStorage().bucket().file(path).getMetadata(); } catch { reject("녹음을 찾을 수 없어요. 다시 올려 주세요."); }
    if (!meta || !/^audio\/(webm|ogg|mp4|mpeg|wav)(;|$)/.test(String(meta.contentType)) || !Number.isFinite(Number(meta.size)) || Number(meta.size) <= 0 || Number(meta.size) > 10 * 1024 * 1024) reject("녹음 파일을 확인해 주세요.");
  }
  return db.runTransaction(async (tx) => {
    const [student, school, index, rate, set] = await tx.getAll(studentRef, schoolRef, indexRef, rateRef, db.doc(sp(schoolId, `sentenceSets/${setId}`)));
    const year = school.get("year");
    if (!student.exists || student.get("active") !== true || String(student.get("email")).toLowerCase() !== email
      || school.get("status") !== "active" || student.get("year") !== year || index.get("year") !== year
      || index.get("schoolId") !== schoolId || index.get("sid") !== email || !program.grades.includes(student.get("grade"))
      || !taskSetIds(task, student.get("grade")).includes(setId)) throw new HttpsError("permission-denied", "현재 학교 학생 명단과 과제를 확인해 주세요.");
    const sentences = set.exists ? set.get("items") : sets.find((s) => s.setId === setId)?.items;
    const sentence = Array.isArray(sentences) ? sentences.find((s: Sentence) => s.no === data.no) as Sentence | undefined : undefined;
    if (!sentence) reject("연습 문장을 찾을 수 없어요.");
    const id = englishItemId(year, email, setId, Number(data.no));
    const ref = db.doc(sp(schoolId, `englishItems/${id}`));
    const existing = await tx.get(ref);
    const ticket = ticketRef ? await tx.get(ticketRef) : undefined;
    if (existing.exists && (existing.get("program") !== programId || existing.get("task") !== taskId)) reject("기존 문장의 과제를 확인해 주세요.");
    if (ticket && (ticket.get("uid") !== req.auth!.uid || (ticket.get("consumedBy") && ticket.get("consumedBy") !== id))) reject("이미 다른 문장에 사용한 녹음이에요.");
    const change = sentenceChange(data, sentence!, (existing.data() ?? {}) as Saved, Date.now());
    // A committed round may be retried after its response was lost, even at quota.
    // Charge/check the rate only for a new write, under the same transaction.
    if (!change) return { id, existing: true };
    if (ticket?.get("consumedBy")) reject("이미 사용한 녹음이에요. 다시 녹음해 주세요.");
    const rateField = data.action === "request" ? "requestTimes" : "times";
    const times = data.action === "request" ? sentenceRequestTimes(rate.get(rateField), Date.now()) : recentSubmissionTimes(rate.get(rateField), Date.now());
    tx.set(ref, { sid: email, year, grade: student.get("grade"), classNo: student.get("classNo"), program: programId, task: taskId, setId, no: data.no, ...change, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(rateRef, { [rateField]: times, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (ticketRef) tx.update(ticketRef, { consumedBy: id });
    return { id, existing: false };
  });
});
