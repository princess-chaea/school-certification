import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getStorage } from "firebase-admin/storage";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { db, loadConfig, REGION, FieldValue, requireStaff, staffCanSeeStudent, todayKey } from "./common.js";
import { parseStudentEmail } from "./shared/domain.js";

export const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

function client() {
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
}

/** 하루 AI 호출 상한 확인 + 사용량 기록. 상한을 넘으면 false */
async function reserveUsage(kind: string, limit: number): Promise<boolean> {
  const ref = db.doc(`aiUsage/${todayKey()}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const total = Number(snap.get("total") ?? 0);
    if (total >= limit) return false;
    tx.set(ref, { total: FieldValue.increment(1), [kind]: FieldValue.increment(1), date: todayKey() }, { merge: true });
    return true;
  });
}

async function recordTokens(usage: { input_tokens?: number; output_tokens?: number } | undefined, model: string) {
  if (!usage) return;
  await db.doc(`aiUsage/${todayKey()}`).set(
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
  bookTitle: z.string().nullable(),
  activityType: z.string().nullable(),
  feedback: z.string(),
  question: z.string().nullable(),
});

const SYSTEM_PHOTO = `당신은 초등학교 「학교장 인증제」 활동 사진을 1차로 확인하는 보조 교사입니다.
최종 판단은 담임 선생님이 합니다. 당신의 판단은 선생님이 의심 기록을 빨리 찾도록 돕는 참고용입니다.

verdict 기준:
- ok: 요구한 활동이 사진에서 분명히 확인됨
- check: 흐릿함, 일부만 보임, 활동인지 애매함 등 선생님이 한 번 볼 필요가 있음
- reject: 활동과 전혀 관계없는 사진(빈 화면, 장난 사진, 다른 과목 숙제 등)

reason: 선생님에게 보여 줄 한 문장 근거 (한국어)
feedback: 학생에게 보여 줄 따뜻한 격려 1~2문장 (초등학생 눈높이, 존댓말 아닌 다정한 반말, 이모지 1개까지). 비교·점수 언급 금지.
사진 속 사람의 얼굴, 이름 등 개인 정보는 언급하지 마세요.`;

function photoPrompt(program: string, task: string | undefined, data: FirebaseFirestore.DocumentData, activityTypes: string[]) {
  if (program === "reading") {
    return `[독서 마라톤] 독서기록장(독후 감상 기록) 1쪽 사진입니다.
학생이 적은 책 제목: ${data.bookTitle || "(없음)"}
확인할 것: 독서기록장 쪽이 맞는지, 내용이 성실히 채워졌는지(1쪽 분량), 책 제목.
bookTitle: 사진이나 입력에서 읽을 수 있는 책 제목(없으면 null). activityType: null.
question: 이 책에 대해 학생이 더 생각해 볼 만한 열린 질문 1개 (짧게).`;
  }
  if (program === "carbon") {
    return `[탄소중립 환경 지킴이] 탄소중립·환경 보호 실천 사진입니다.
학생이 고른 활동 종류: ${data.activityType || "(없음)"} / 학생 소감: ${data.text || "(없음)"}
확인할 것: 본인의 실천 과정이 확인되는 사진인지, 탄소중립에 도움이 되는 활동인지.
activityType: 다음 중 가장 알맞은 것 하나 → ${activityTypes.join(", ")}
bookTitle: null. question: null.`;
  }
  return `[영어 - ${task === "t2" ? "알공" : "영어 과제"}] 학습 완료 화면 캡처입니다.
확인할 것: 영어 학습 앱(알공 등)의 완료·결과 화면이 맞는지.
bookTitle: null. activityType: null. question: null.`;
}

export const reviewSubmission = onDocumentCreated(
  { document: "submissions/{id}", region: REGION, secrets: [ANTHROPIC_API_KEY], memory: "512MiB", timeoutSeconds: 120 },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    if (data.source !== "student" || !data.photoPath || data.isDemo) return;
    if (!(data.program === "reading" || data.program === "carbon" || (data.program === "english" && data.task === "t2"))) return;

    const config = await loadConfig();
    if (!config.ai.enabled) return;
    if (!(await reserveUsage("photo", config.ai.dailyLimit))) {
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
              {
                type: "image",
                source: { type: "base64", media_type: mediaType as "image/jpeg", data: buf.toString("base64") },
              },
              { type: "text", text: photoPrompt(data.program, data.task, data, config.programs.carbon.activityTypes ?? []) },
            ],
          },
        ],
      });
      await recordTokens(response.usage, model);
      if (response.stop_reason === "refusal" || !response.parsed_output) {
        await snap.ref.update({ ai: { verdict: "check", reason: "AI가 판단하지 못했어요. 선생님 확인이 필요해요.", model, at: FieldValue.serverTimestamp() } });
        return;
      }
      const r = response.parsed_output;
      await snap.ref.update({
        ai: { ...r, model, at: FieldValue.serverTimestamp() },
        ...(data.program === "carbon" && !data.activityType && r.activityType ? { activityType: r.activityType } : {}),
      });
    } catch (err) {
      logger.error("photo review failed", { id: event.params.id, err: String(err) });
      await snap.ref.update({ ai: { verdict: "check", reason: "AI 확인 중 오류가 났어요.", at: FieldValue.serverTimestamp() } });
    }
  },
);

// ── A-3: 영어 타이핑 오답 설명 (Haiku) ──────────────────────────────

export const explainTyping = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY] }, async (req) => {
  const email = req.auth?.token.email;
  if (!parseStudentEmail(email)) throw new HttpsError("permission-denied", "학생 계정만 사용할 수 있어요.");
  const { ko, answer, attempts } = req.data as { ko?: string; answer?: string; attempts?: string[] };
  if (!answer || !Array.isArray(attempts) || !attempts.length) throw new HttpsError("invalid-argument", "입력이 부족해요.");
  const config = await loadConfig();
  if (!config.ai.enabled) throw new HttpsError("unavailable", "지금은 AI 설명을 쓸 수 없어요.");
  if (!(await reserveUsage("typing", config.ai.dailyLimit))) throw new HttpsError("resource-exhausted", "오늘 AI 사용량이 다 찼어요.");

  const model = config.ai.photoModel;
  const response = await client().messages.create({
    model,
    max_tokens: 1024,
    output_config: { effort: "low" },
    system: `너는 초등학생(4~6학년)의 영어 문장 쓰기를 돕는 다정한 선생님이야.
학생이 쓴 문장과 정답을 비교해서 무엇이 틀렸는지 한국어로 2~3문장으로 설명해.
- 정답 문장 전체를 그대로 알려주지 마. 틀린 단어의 규칙(예: 과거분사, 관사 a/the, 축약형, 철자)을 힌트로 줘.
- 쉬운 말, 다정한 반말, 마지막에 응원 한마디.`,
    messages: [
      {
        role: "user",
        content: `해석: ${ko ?? ""}\n정답: ${answer}\n학생이 쓴 답(최근 순서대로):\n${attempts.slice(-3).map((a, i) => `${i + 1}. ${a}`).join("\n")}`,
      },
    ],
  });
  await recordTokens(response.usage, model);
  if (response.stop_reason === "refusal") return { text: "이번 문장은 선생님께 직접 물어보자!" };
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  return { text: text || "틀린 단어를 천천히 다시 비교해 보자!" };
});

// ── A-4: 교사용 피드백·누가기록 초안 (Sonnet) ─────────────────────────

export const draftComment = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120 }, async (req) => {
  const staff = await requireStaff(req);
  const { sid, kind } = req.data as { sid?: string; kind?: "feedback" | "record" };
  if (!sid) throw new HttpsError("invalid-argument", "학생을 선택하세요.");
  const stuSnap = await db.doc(`students/${sid}`).get();
  if (!stuSnap.exists) throw new HttpsError("not-found", "학생을 찾을 수 없어요.");
  const stu = stuSnap.data() as { grade: number; classNo: number; progress?: unknown };
  if (!staffCanSeeStudent(staff, stu)) throw new HttpsError("permission-denied", "담당 학생이 아니에요.");

  const config = await loadConfig();
  if (!config.ai.enabled) throw new HttpsError("unavailable", "AI 기능이 꺼져 있어요.");
  if (!(await reserveUsage("teacher", config.ai.dailyLimit))) throw new HttpsError("resource-exhausted", "오늘 AI 사용량이 다 찼어요.");

  const subs = await db.collection("submissions").where("sid", "==", sid).orderBy("createdAt", "desc").limit(40).get();
  const records = subs.docs
    .map((d) => d.data())
    .filter((d) => d.status === "active")
    .map((d) => {
      const date = d.createdAt?.toDate?.().toISOString().slice(0, 10) ?? "";
      const parts = [date, config.programs[d.program as "reading"]?.name ?? d.program];
      if (d.bookTitle) parts.push(`책: ${d.bookTitle}`);
      if (d.activityType) parts.push(`활동: ${d.activityType}`);
      if (d.text) parts.push(`소감: ${String(d.text).slice(0, 120)}`);
      if (d.source === "teacher") parts.push(`교사 관찰 ${d.count}회`);
      return "- " + parts.join(" / ");
    })
    .join("\n");

  const instruction =
    kind === "record"
      ? `학교생활기록부 '창의적 체험활동' 또는 '행동특성 및 종합의견'에 참고할 수 있는 누가기록 초안을 2~3문장으로 써 주세요.
- 관찰 가능한 사실과 성장 중심, '~함', '~임' 같은 기록체 종결.
- 학생 이름은 쓰지 말고 주어를 생략하세요. 과장·추측 금지.`
      : `담임 선생님이 학생에게 남길 격려 피드백 초안을 2문장으로 써 주세요.
- 학생의 노력과 꾸준함을 구체적으로 칭찬하고, 다음 도전을 가볍게 제안.
- 다정한 말투, 다른 학생과 비교 금지.`;

  const model = config.ai.teacherModel;
  const params = {
    model,
    max_tokens: 2048,
    output_config: { effort: "low" as const },
    system: "당신은 초등학교 교사의 업무를 돕는 보조자입니다. 「학교장 인증제」(독서 마라톤, 탄소중립 환경 지킴이, 영어 말하기) 활동 기록을 바탕으로 초안을 씁니다. 교사가 검토·수정한 뒤 사용합니다.",
    messages: [
      {
        role: "user" as const,
        content: `${instruction}\n\n[학년] ${stu.grade}학년\n[진행 현황] ${JSON.stringify(stu.progress ?? {})}\n[최근 활동 기록]\n${records || "(기록 없음)"}`,
      },
    ],
  };
  // Sonnet은 안전 분류기 오판에 대비해 서버 측 대체 모델(fallbacks: "default")을 켠다
  const response = await client().beta.messages.create({
    ...params,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  await recordTokens(response.usage, model);
  if (response.stop_reason === "refusal") throw new HttpsError("failed-precondition", "AI가 초안을 만들지 못했어요. 직접 작성해 주세요.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  return { text };
});
