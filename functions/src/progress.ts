import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { AggregateField } from "firebase-admin/firestore";
import { db, loadConfig, REGION, FieldValue } from "./common.js";
import { computeProgress, type EnglishCounts } from "./shared/domain.js";

async function sumSubmissions(sid: string, program: string, task?: string) {
  let q = db.collection("submissions").where("sid", "==", sid).where("status", "==", "active").where("program", "==", program);
  if (task) q = q.where("task", "==", task);
  const agg = await q.aggregate({ total: AggregateField.sum("count") }).get();
  return Number(agg.data().total ?? 0);
}

async function countChecked(sid: string, task: string) {
  const agg = await db
    .collection("englishItems")
    .where("sid", "==", sid)
    .where("task", "==", task)
    .where("status", "==", "checked")
    .count()
    .get();
  return agg.data().count;
}

/** 학생 한 명의 분야별 진행률·금은동을 다시 계산해 students/{sid}.progress 에 기록 */
export async function recomputeStudent(sid: string) {
  const ref = db.doc(`students/${sid}`);
  const snap = await ref.get();
  if (!snap.exists) {
    logger.warn("student not found for progress", { sid });
    return;
  }
  const grade = Number(snap.get("grade"));
  const config = await loadConfig();
  const [reading, carbon, t1, t2, t3, t4] = await Promise.all([
    sumSubmissions(sid, "reading"),
    sumSubmissions(sid, "carbon"),
    countChecked(sid, "t1"),
    sumSubmissions(sid, "english", "t2"),
    countChecked(sid, "t3"),
    sumSubmissions(sid, "english", "t4"),
  ]);
  const english: EnglishCounts = { t1, t2, t3, t4 };
  const progress = computeProgress(config, grade, { reading, carbon, english });
  await ref.set({ progress, progressUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export const onSubmissionWritten = onDocumentWritten({ document: "submissions/{id}", region: REGION }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const sid = (after?.sid ?? before?.sid) as string | undefined;
  if (!sid || after?.seed || (!after && before?.seed)) return; // 더미 일괄 생성·삭제는 마지막에 한 번만 계산
  // 진행률에 영향을 주는 필드가 바뀐 경우만 재계산
  if (before && after && before.status === after.status && before.count === after.count && before.program === after.program) return;
  await recomputeStudent(sid);
});

export const onEnglishItemWritten = onDocumentWritten({ document: "englishItems/{id}", region: REGION }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const sid = (after?.sid ?? before?.sid) as string | undefined;
  if (!sid || after?.seed || (!after && before?.seed)) return;
  const wasChecked = before?.status === "checked";
  const isChecked = after?.status === "checked";
  if (wasChecked === isChecked) return;
  await recomputeStudent(sid);
});
