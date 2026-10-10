import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { AggregateField } from "firebase-admin/firestore";
import { db, loadConfig, REGION, FieldValue, sp } from "./common.js";
import { activePrograms, computeProgress } from "./shared/domain.js";

async function sumSubmissions(schoolId: string, year: number, sid: string, program: string, task?: string) {
  let q = db.collection(sp(schoolId, "submissions")).where("year", "==", year).where("sid", "==", sid).where("status", "==", "active").where("program", "==", program);
  if (task) q = q.where("task", "==", task);
  const agg = await q.aggregate({ total: AggregateField.sum("count") }).get();
  return Number(agg.data().total ?? 0);
}

async function countChecked(schoolId: string, year: number, sid: string, program: string, task: string) {
  const agg = await db
    .collection(sp(schoolId, "englishItems"))
    .where("year", "==", year)
    .where("sid", "==", sid)
    .where("program", "==", program)
    .where("task", "==", task)
    .where("status", "==", "checked")
    .count()
    .get();
  return agg.data().count;
}

/** 학생 한 명의 항목별 진행률·금은동을 다시 계산해 students/{sid}.progress 에 기록 */
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
  const counts: Record<string, number | Record<string, number>> = {};
  await Promise.all(
    activePrograms(config, grade).map(async (p) => {
      if (p.kind === "tasks") {
        const entries = await Promise.all(
          (p.tasks ?? []).map(async (t) => [t.id, t.kind === "sentences" ? await countChecked(schoolId, year, sid, p.id, t.id) : await sumSubmissions(schoolId, year, sid, p.id, t.id)] as const),
        );
        counts[p.id] = Object.fromEntries(entries);
      } else {
        counts[p.id] = await sumSubmissions(schoolId, year, sid, p.id);
      }
    }),
  );
  const progress = computeProgress(config, grade, counts);
  await ref.update({ progress, progressUpdatedAt: FieldValue.serverTimestamp() });
}

export const onSubmissionWritten = onDocumentWritten({ document: "schools/{schoolId}/submissions/{id}", region: REGION }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const sid = (after?.sid ?? before?.sid) as string | undefined;
  if (!sid || after?.seed || (!after && before?.seed)) return; // 더미 일괄 생성·삭제는 마지막에 한 번만 계산
  const wasActive = before?.status === "active";
  const isActive = after?.status === "active";
  if (wasActive === isActive && before?.count === after?.count) return;
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
