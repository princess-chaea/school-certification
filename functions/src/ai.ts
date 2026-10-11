import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getStorage } from "firebase-admin/storage";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import type { ProgramDef, TaskDef } from "./shared/domain.js";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { db, loadConfig, REGION, FieldValue, todayKey, sp } from "./common.js";

export const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const ANTHROPIC_WORKSPACE_ID = defineString("ANTHROPIC_WORKSPACE_ID", {
  description: "Anthropic workspace ID for AI review requests",
});

function client() {
  return new Anthropic({
    apiKey: ANTHROPIC_API_KEY.value(),
    defaultHeaders: { "anthropic-workspace-id": ANTHROPIC_WORKSPACE_ID.value() },
    // Automatic retries can spend another request after a timeout whose result is unknown.
    maxRetries: 0,
  });
}

// These are server hard ceilings. Students can keep submitting records after an AI ceiling;
// teachers review those records directly. 30 first-day records fit below the student ceilings.
const STUDENT_AI_PER_10_MIN = 40;
const STUDENT_AI_PER_DAY = 60;
const SCHOOL_AI_PER_DAY = 3000;
const PLATFORM_AI_PER_DAY = 3000;
const PLATFORM_AI_PER_MONTH = 50000;
const MAX_AI_PHOTO_BYTES = 5 * 1024 * 1024;

type Reservation =
  | { status: "reserved" | "duplicate" }
  | { status: "skipped"; category: string; reason: string };

/** One transaction reserves the submission and every cost ceiling before the paid request. */
async function reserveUsage(schoolId: string, data: FirebaseFirestore.DocumentData, id: string, kind: "photo" | "text", configuredLimit: number): Promise<Reservation> {
  const day = todayKey();
  const month = day.slice(0, 7);
  const window = Math.floor(Date.now() / 600_000);
  const studentKey = createHash("sha256").update(String(data.sid)).digest("hex").slice(0, 24);
  const scope = { sid: data.sid, year: data.year, grade: data.grade, classNo: data.classNo, program: data.program };
  const job = db.doc(sp(schoolId, `aiJobs/${id}`));
  const school = db.doc(sp(schoolId, `aiUsage/${day}`));
  const studentDay = db.doc(sp(schoolId, `aiUsage/student_${studentKey}_${day}`));
  const studentWindow = db.doc(sp(schoolId, `aiUsage/window_${studentKey}_${window}`));
  const platformDay = db.doc(`platformAiUsage/${day}`);
  const platformMonth = db.doc(`platformAiUsage/${month}`);
  const refs = [job, school, studentDay, studentWindow, platformDay, platformMonth];
  const schoolLimit = Number.isFinite(configuredLimit) ? Math.min(SCHOOL_AI_PER_DAY, Math.max(0, Math.floor(configuredLimit))) : SCHOOL_AI_PER_DAY;

  return db.runTransaction(async (tx) => {
    const [jobSnap, schoolSnap, studentDaySnap, studentWindowSnap, platformDaySnap, platformMonthSnap] = await Promise.all(refs.map((ref) => tx.get(ref)));
    if (jobSnap.exists) return { status: "duplicate" };
    const used = (snap: FirebaseFirestore.DocumentSnapshot) => Number(snap.get("total") ?? 0);
    const blocked = [
      { used: used(studentWindowSnap), limit: STUDENT_AI_PER_10_MIN, category: "student_burst", reason: "짧은 시간에 올린 기록이 많아 자동 확인을 건너뛰었어요. 선생님이 직접 확인해 주세요." },
      { used: used(studentDaySnap), limit: STUDENT_AI_PER_DAY, category: "student_daily", reason: "오늘 학생별 자동 확인 범위를 넘어 선생님이 직접 확인해 주세요." },
      { used: used(schoolSnap), limit: schoolLimit, category: "school_daily", reason: "오늘 학교의 자동 확인 범위를 넘어 선생님이 직접 확인해 주세요." },
      { used: used(platformDaySnap), limit: PLATFORM_AI_PER_DAY, category: "platform_daily", reason: "오늘 자동 확인 서비스의 전체 이용 범위를 넘어 선생님이 직접 확인해 주세요." },
      { used: used(platformMonthSnap), limit: PLATFORM_AI_PER_MONTH, category: "platform_monthly", reason: "이번 달 자동 확인 서비스의 전체 이용 범위를 넘어 선생님이 직접 확인해 주세요." },
    ].find((item) => item.used >= item.limit);
    if (blocked) {
      tx.create(job, { ...scope, state: "skipped", kind, category: blocked.category, reason: blocked.reason, at: FieldValue.serverTimestamp() });
      return { status: "skipped", category: blocked.category, reason: blocked.reason };
    }
    tx.create(job, { ...scope, state: "reserved", kind, reason: "AI 1차 확인이 진행 중이에요.", at: FieldValue.serverTimestamp() });
    tx.set(school, { total: FieldValue.increment(1), [kind]: FieldValue.increment(1), date: day }, { merge: true });
    for (const ref of [studentDay, studentWindow, platformDay, platformMonth]) {
      tx.set(ref, { total: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return { status: "reserved" };
  });
}

async function reserveOrMarkForTeacher(schoolId: string, data: FirebaseFirestore.DocumentData, id: string, kind: "photo" | "text", limit: number) {
  const result = await reserveUsage(schoolId, data, id, kind, limit);
  if (result.status === "skipped") {
    await saveReview(schoolId, id, data, { verdict: "check", reason: result.reason, errorCategory: result.category });
    logger.warn("AI budget reached", { schoolId, id, category: result.category });
  }
  return result.status === "reserved";
}

async function finishJob(schoolId: string, id: string, state: "completed" | "failed") {
  try {
    await db.doc(sp(schoolId, `aiJobs/${id}`)).update({
      state,
      reason: state === "failed" ? "자동 확인 결과를 저장하지 못했어요. 선생님이 직접 확인해 주세요." : FieldValue.delete(),
      finishedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error("AI job state update failed", { id, err: String(err) });
  }
}

async function recordTokens(schoolId: string, usage: { input_tokens?: number; output_tokens?: number } | undefined, model: string) {
  if (!usage) return;
  await db.doc(sp(schoolId, `aiUsage/${todayKey()}`)).set(
    {
      tokens: {
        [model.replace(/[^a-z0-9]/gi, "_")]: {
          input: FieldValue.increment(usage.input_tokens ?? 0),
          output: FieldValue.increment(usage.output_tokens ?? 0),
        },
      },
    },
    { merge: true },
  );
}

// ── A-1/A-2: 학생 사진 제출 1차 확인 (Haiku) ─────────────────────────

const PhotoReview = z.object({
  verdict: z.enum(["ok", "check", "reject"]),
  reason: z.string(),
  activityType: z.string().nullable(),
});

/** AI 판정은 학생이 읽을 수 없는 aiReviews/{제출ID} 에만 저장 (교사 검토용) */
async function saveReview(schoolId: string, id: string, data: FirebaseFirestore.DocumentData, review: Record<string, unknown>) {
  await db.doc(sp(schoolId, `aiReviews/${id}`)).set({
    sid: data.sid, year: data.year, grade: data.grade, classNo: data.classNo, program: data.program,
    ...review, at: FieldValue.serverTimestamp(),
  });
}

const SYSTEM_PHOTO = `당신은 초등학교 「학교장 인증제」 활동 증빙 사진을 1차로 확인하는 보조 교사입니다.
최종 판단은 선생님이 합니다. 당신의 판단은 선생님이 의심 기록을 빨리 찾도록 돕는 참고용입니다.

verdict 기준:
- ok: 요구한 활동이 사진에서 분명히 확인됨
- check: 흐릿함, 일부만 보임, 활동인지 애매함 등 선생님이 한 번 볼 필요가 있음
- reject: 활동과 전혀 관계없는 사진(빈 화면, 장난 사진, 다른 과목 숙제 등)

reason: 선생님에게 보여 줄 한 문장 근거 (한국어). 학생에게는 보이지 않습니다.
사진 속 사람의 얼굴, 이름 등 개인 정보는 언급하지 마세요.`;

function photoPrompt(program: ProgramDef, task: TaskDef | undefined, data: FirebaseFirestore.DocumentData) {
  const fields = (data.fields ?? {}) as Record<string, string>;
  const lines = [
    `[인증 항목] ${program.name}${task ? ` - ${task.name}` : ""} (${program.area})`,
    `[항목 설명] ${task?.description ?? program.description}`,
  ];
  for (const f of task?.fields ?? program.fields ?? []) if (fields[f.key]) lines.push(`[${f.label}] ${fields[f.key]}`);
  if (data.activityType) lines.push(`[학생이 고른 활동 종류] ${data.activityType}`);
  if (data.text) lines.push(`[학생 소감] ${String(data.text).slice(0, 300)}`);
  lines.push("확인할 것: 사진이 이 항목의 활동 증빙으로 알맞은지, 본인의 실천이 확인되는지.");
  lines.push(program.choices?.length ? `activityType: 다음 중 가장 알맞은 것 하나 → ${program.choices.join(", ")}` : "activityType: null");
  return lines.join("\n");
}

/** 학생 제출 직후: 자동 인정 항목은 바로 인정(기본은 교사 승인), AI 사진 1차 확인 */
export const onSubmissionCreated = onDocumentCreated(
  { document: "schools/{schoolId}/submissions/{id}", region: REGION, secrets: [ANTHROPIC_API_KEY], memory: "512MiB", timeoutSeconds: 120 },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    if (data.source !== "student" || data.isDemo) return;
    const schoolId = event.params.schoolId;
    // Old clients may still write directly for a short rollout period. Those records remain
    // pending for the teacher; only the server submission gate may spend AI budget or auto-approve.
    if (data.serverValidated !== true) {
      await saveReview(schoolId, snap.id, data, {
        verdict: "check", reason: "서버 검증 전 제출된 기록이에요. 선생님이 직접 확인해 주세요.", errorCategory: "unverified_submission",
      });
      return;
    }
    const config = await loadConfig(schoolId);
    const program = config.programs.find((p) => p.id === data.program);
    const task = program?.tasks?.find((t) => t.id === data.task);
    if (!program || !program.enabled || !program.grades.includes(Number(data.grade)) || (data.task && (!task || task.kind !== "evidence"))) {
      await snap.ref.update({ status: "deleted", deleteReason: "사용할 수 없는 인증 항목·과제" });
      return;
    }

    if (program.approval === "auto") await snap.ref.update({ status: "active", reviewedByName: "자동 인정", reviewedAt: FieldValue.serverTimestamp() });

    if (!config.ai.enabled || program.aiReview === false) return;
    if (!data.photoPath) {
      if (data.text && String(data.text).trim().length >= 2) await reviewText(schoolId, config, program, task, data, snap.id);
      return;
    }
    const path = String(data.photoPath);
    const photoPrefix = `schools/${schoolId}/uploads/${data.sid}/${program.id}/`;
    if (!path.startsWith(photoPrefix) || !/^[^/]+\.jpg$/.test(path.slice(photoPrefix.length)) || data.photoType !== "image/jpeg") {
      await saveReview(schoolId, snap.id, data, {
        verdict: "check", reason: "사진의 업로드 경로 또는 형식을 확인할 수 없어 선생님이 직접 확인해 주세요.", errorCategory: "invalid_photo_reference",
      });
      return;
    }
    let errorPhase: "photo_download" | "ai_request_or_parse" | "review_save" = "photo_download";
    let reserved = false;
    let completed = false;
    try {
      const photoFile = getStorage().bucket().file(path);
      const [metadata] = await photoFile.getMetadata();
      if (metadata.contentType !== "image/jpeg" || Number(metadata.size) > MAX_AI_PHOTO_BYTES || Number(metadata.size) <= 0) {
        await saveReview(schoolId, snap.id, data, {
          verdict: "check", reason: "사진의 파일 형식이나 크기를 확인할 수 없어 선생님이 직접 확인해 주세요.", errorCategory: "invalid_photo_object",
        });
        return;
      }
      reserved = await reserveOrMarkForTeacher(schoolId, data, snap.id, "photo", config.ai.dailyLimit);
      if (!reserved) return;
      const [buf] = await photoFile.download();
      const model = config.ai.photoModel;
      errorPhase = "ai_request_or_parse";
      const response = await client().messages.parse({
        model,
        max_tokens: 2048,
        output_config: { effort: "low", format: zodOutputFormat(PhotoReview) },
        system: SYSTEM_PHOTO,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") } },
              { type: "text", text: photoPrompt(program, task, data) },
            ],
          },
        ],
      });
      // Usage accounting must not turn a completed review into a failed review.
      try {
        await recordTokens(schoolId, response.usage, model);
      } catch (err) {
        logger.error("photo review token accounting failed", { id: snap.id, errorPhase: "token_usage", err: String(err), stack: err instanceof Error ? err.stack : undefined });
      }
      errorPhase = "review_save";
      if (response.stop_reason === "refusal" || !response.parsed_output) {
        await saveReview(schoolId, snap.id, data, {
          verdict: "check", reason: "사진의 활동 여부를 자동으로 판단하지 못했어요. 선생님이 확인해 주세요.", model,
          errorPhase: "ai_request_or_parse", errorCategory: response.stop_reason === "refusal" ? "refusal" : "missing_output",
        });
        completed = true;
        return;
      }
      await saveReview(schoolId, snap.id, data, { ...response.parsed_output, model });
      completed = true;
    } catch (err) {
      logger.error("photo review failed", { id: event.params.id, errorPhase, err: String(err), stack: err instanceof Error ? err.stack : undefined });
      const reasons = {
        photo_download: "첨부 사진을 불러오지 못해 활동을 확인하지 못했어요. 선생님이 사진을 확인해 주세요.",
        ai_request_or_parse: "자동 확인 서비스의 응답을 받거나 해석하지 못했어요. 선생님이 활동을 확인해 주세요.",
        review_save: "자동 확인 결과를 저장하지 못했어요. 선생님이 활동을 확인해 주세요.",
      };
      try {
        await saveReview(schoolId, snap.id, data, {
          verdict: "check", reason: reasons[errorPhase], errorPhase, errorCategory: `${errorPhase}_failed`,
        });
      } catch (saveError) {
        logger.error("photo review fallback save failed", { id: event.params.id, err: String(saveError) });
      }
    } finally {
      if (reserved) await finishJob(schoolId, snap.id, completed ? "completed" : "failed");
    }
  },
);

const TextReview = z.object({ verdict: z.enum(["ok", "check", "reject"]), reason: z.string() });

/** 사진 없이 글만 올린 기록: 항목과 관련 있는 내용인지 1차 확인 (교사 경고용) */
async function reviewText(schoolId: string, config: Awaited<ReturnType<typeof loadConfig>>, program: ProgramDef, task: TaskDef | undefined, data: FirebaseFirestore.DocumentData, id: string) {
  let reserved = false;
  let completed = false;
  try {
    reserved = await reserveOrMarkForTeacher(schoolId, data, id, "text", config.ai.dailyLimit);
    if (!reserved) return;
    const model = config.ai.photoModel;
    const response = await client().messages.parse({
      model,
      max_tokens: 1024,
      output_config: { effort: "low", format: zodOutputFormat(TextReview) },
      system: "초등학교 인증제 활동 기록(글)을 1차로 확인하는 보조 교사입니다. ok=항목과 관련된 성실한 기록, check=짧거나 애매함, reject=관련 없음·의미 없는 글자·복사한 듯한 내용. reason 은 선생님에게 보여 줄 한국어 한 문장.",
      messages: [{ role: "user", content: `[인증 항목] ${program.name}${task ? ` - ${task.name}` : ""}\n[설명] ${task?.description ?? program.description}\n[학생 글]\n${String(data.text).slice(0, 1500)}` }],
    });
    try {
      await recordTokens(schoolId, response.usage, model);
    } catch (err) {
      logger.error("text review token accounting failed", { id, err: String(err) });
    }
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      await saveReview(schoolId, id, data, { verdict: "check", reason: "글의 활동 여부를 자동으로 판단하지 못했어요. 선생님이 확인해 주세요.", errorCategory: "missing_output" });
      completed = true;
      return;
    }
    await saveReview(schoolId, id, data, { ...response.parsed_output, model });
    completed = true;
  } catch (err) {
    logger.error("text review failed", { id, err: String(err) });
    try {
      await saveReview(schoolId, id, data, { verdict: "check", reason: "자동 확인 서비스의 응답을 받지 못했어요. 선생님이 활동을 확인해 주세요.", errorCategory: "ai_request_failed" });
    } catch (saveError) {
      logger.error("text review fallback save failed", { id, err: String(saveError) });
    }
  } finally {
    if (reserved) await finishJob(schoolId, id, completed ? "completed" : "failed");
  }
}
