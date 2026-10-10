import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { AggregateField } from "firebase-admin/firestore";
import { db, loadConfig, REGION, FieldValue, sp } from "./common.js";
import { computeProgress, type EnglishCounts } from "./shared/domain.js";

async function sumSubmissions(schoolId: string, year: number, sid: string, program: string, task?: string) {
  let q = db.collection(sp(schoolId, "submissions")).where("year", "==", year).where("sid", "==", sid).where("status", "==", "active").where("program", "==", program);
  if (task) q = q.where("task", "==", task);
  const agg = await q.aggregate({ total: AggregateField.sum("count") }).get();
  return Number(agg.data().total ?? 0);
}

async function countChecked(schoolId: string, year: number, sid: string, task: string) {
  const agg = await db
    .collection(sp(schoolId, "englishItems"))
    .where("year", "==", year)
    .where("sid", "==", sid)
    .where("task", "==", task)
    .where("status", "==", "checked")
    .count()
    .get();
  return agg.data().count;
}

/** 학생 한 명의 분야별 진행률·금은동을 다시 계산해 students/{sid}.progress 에 기록 */
export async function recomputeStudent(schoolId: string, sid: string, expectedYear?: number) {
  const ref = db.doc(sp(schoolId, `students/${sid}`));
  const snap = await ref.get();
  if (!snap.exists) {
    logger.warn("student not found for progress", { sid });
    return;
  }
  if (expectedYear && Number(snap.get("year")) !== expectedYear) return; // 지난 학년도 기록 변경은 현재 명단에 반영하지 않음
  const grade = Number(snap.get("grade"));
  const year = Number(snap.get("year"));
  const config = await loadConfig(schoolId);
  const [reading, carbon, t1, t2, t3, t4] = await Promise.all([
    sumSubmissions(schoolId, year, sid, "reading"),
    sumSubmissions(schoolId, year, sid, "carbon"),
    countChecked(schoolId, year, sid, "t1"),
    sumSubmissions(schoolId, year, sid, "english", "t2"),
    countChecked(schoolId, year, sid, "t3"),
    sumSubmissions(schoolId, year, sid, "english", "t4"),
  ]);
  const english: EnglishCounts = { t1, t2, t3, t4 };
  const progress = computeProgress(config, grade, { reading, carbon, english });
  await ref.set({ progress, progressUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export const onSubmissionWritten = onDocumentWritten({ document: "schools/{schoolId}/submissions/{id}", region: REGION }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const sid = (after?.sid ?? before?.sid) as string | undefined;
  if (!sid || after?.seed || (!after && before?.seed)) return; // 더미 일괄 생성·삭제는 마지막에 한 번만 계산
  // 진행률에 영향을 주는 필드가 바뀐 경우만 재계산
  if (before && after && before.status === after.status && before.count === after.count && before.program === after.program) return;
  await recomputeStudent(event.params.schoolId, sid, Number((after ?? before)?.year) || undefined);
});

export const onEnglishItemWritten = onDocumentWritten({ document: "schools/{schoolId}/englishItems/{id}", region: REGION }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const sid = (after?.sid ?? before?.sid) as string | undefined;
  if (!sid || after?.seed || (!after && before?.seed)) return;
  const wasChecked = before?.status === "checked";
  const isChecked = after?.status === "checked";
  if (wasChecked === isChecked) return;
  await recomputeStudent(event.params.schoolId, sid, Number((after ?? before)?.year) || undefined);
});
