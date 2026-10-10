import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getStorage } from "firebase-admin/storage";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import type { ProgramDef, TaskDef } from "./shared/domain.js";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { db, loadConfig, REGION, FieldValue, todayKey, sp } from "./common.js";

export const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

function client() {
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
}

/** 하루 AI 호출 상한 확인 + 사용량 기록. 상한을 넘으면 false */
async function reserveUsage(schoolId: string, kind: string, limit: number): Promise<boolean> {
  const ref = db.doc(sp(schoolId, `aiUsage/${todayKey()}`));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const total = Number(snap.get("total") ?? 0);
    if (total >= limit) return false;
    tx.set(ref, { total: FieldValue.increment(1), [kind]: FieldValue.increment(1), date: todayKey() }, { merge: true });
    return true;
  });
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
    const config = await loadConfig(schoolId);
    const program = config.programs.find((p) => p.id === data.program);
    const task = program?.tasks?.find((t) => t.id === data.task);
    if (!program) {
      await snap.ref.update({ status: "deleted", deleteReason: "없는 인증 항목" });
      return;
    }

    if (program.approval === "auto") await snap.ref.update({ status: "active", reviewedByName: "자동 인정", reviewedAt: FieldValue.serverTimestamp() });

    if (!config.ai.enabled || program.aiReview === false) return;
    if (!data.photoPath) {
      if (data.text && String(data.text).trim().length >= 2) await reviewText(schoolId, config, program, task, data, snap.id);
      return;
    }
    if (!(await reserveUsage(schoolId, "photo", config.ai.dailyLimit))) {
      logger.warn("AI daily limit reached");
      return;
    }
    try {
      const [buf] = await getStorage().bucket().file(data.photoPath).download();
      const mediaType = (data.photoType as string) || "image/jpeg";
      const model = config.ai.photoModel;
      const response = await client().messages.parse({
        model,
        max_tokens: 2048,
        output_config: { effort: "low", format: zodOutputFormat(PhotoReview) },
        system: SYSTEM_PHOTO,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg", data: buf.toString("base64") } },
              { type: "text", text: photoPrompt(program, task, data) },
            ],
          },
        ],
      });
      await recordTokens(schoolId, response.usage, model);
      if (response.stop_reason === "refusal" || !response.parsed_output) {
        await saveReview(schoolId, snap.id, data, { verdict: "check", reason: "AI가 판단하지 못했어요. 선생님 확인이 필요해요.", model });
        return;
      }
      await saveReview(schoolId, snap.id, data, { ...response.parsed_output, model });
    } catch (err) {
      logger.error("photo review failed", { id: event.params.id, err: String(err) });
      await saveReview(schoolId, snap.id, data, { verdict: "check", reason: "AI 확인 중 오류가 났어요." });
    }
  },
);

const TextReview = z.object({ verdict: z.enum(["ok", "check", "reject"]), reason: z.string() });

/** 사진 없이 글만 올린 기록: 항목과 관련 있는 내용인지 1차 확인 (교사 경고용) */
async function reviewText(schoolId: string, config: Awaited<ReturnType<typeof loadConfig>>, program: ProgramDef, task: TaskDef | undefined, data: FirebaseFirestore.DocumentData, id: string) {
  if (!(await reserveUsage(schoolId, "text", config.ai.dailyLimit))) return;
  try {
    const model = config.ai.photoModel;
    const response = await client().messages.parse({
      model,
      max_tokens: 1024,
      output_config: { effort: "low", format: zodOutputFormat(TextReview) },
      system: "초등학교 인증제 활동 기록(글)을 1차로 확인하는 보조 교사입니다. ok=항목과 관련된 성실한 기록, check=짧거나 애매함, reject=관련 없음·의미 없는 글자·복사한 듯한 내용. reason 은 선생님에게 보여 줄 한국어 한 문장.",
      messages: [{ role: "user", content: `[인증 항목] ${program.name}${task ? ` - ${task.name}` : ""}\n[설명] ${task?.description ?? program.description}\n[학생 글]\n${String(data.text).slice(0, 1500)}` }],
    });
    await recordTokens(schoolId, response.usage, model);
    if (response.stop_reason === "refusal" || !response.parsed_output) return;
    await saveReview(schoolId, id, data, { ...response.parsed_output, model });
  } catch (err) {
    logger.error("text review failed", { err: String(err) });
  }
}
