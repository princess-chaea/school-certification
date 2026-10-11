import { createHash } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, FieldValue, REGION, requireSchoolId, sp, todayKey, type StaffDoc } from "./common.js";
import { mergeConfig, type AppConfig, type ProgramDef } from "./shared/domain.js";

const invalid = (message: string): never => { throw new HttpsError("invalid-argument", message); };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const identifier = (value: unknown, max = 100): string => {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("/") || value === "." || value === "..") invalid("항목 또는 학생 정보를 확인해 주세요.");
  return value as string;
};
export function validateBulkInput(data: Record<string, unknown>) {
  const program = identifier(data.program, 40);
  const task = data.task === undefined || data.task === "" ? undefined : identifier(data.task, 40);
  const requestId = identifier(data.requestId);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) invalid("요청 번호를 확인해 주세요.");
  if (!Array.isArray(data.studentIds) || data.studentIds.length < 1 || data.studentIds.length > 200) invalid("학생을 1~200명 선택해 주세요.");
  const studentIds = (data.studentIds as unknown[]).map((id) => identifier(id, 254)).sort();
  if (new Set(studentIds).size !== studentIds.length) invalid("학생이 중복 선택되었어요.");
  if (typeof data.count !== "number" || !Number.isInteger(data.count) || data.count < 1 || data.count > 100) invalid("인정 횟수는 1~100 사이의 정수로 입력해 주세요.");
  if (data.recognitionMode !== "observation" && data.recognitionMode !== "offline") invalid("인정 방식을 확인해 주세요.");
  if (typeof data.activityDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.activityDate) || !Number.isFinite(Date.parse(data.activityDate)) || new Date(data.activityDate).toISOString().slice(0, 10) !== data.activityDate) invalid("활동 날짜를 확인해 주세요.");
  if (data.memo !== undefined && (typeof data.memo !== "string" || data.memo.length > 300)) invalid("메모는 300자 이내로 적어 주세요.");
  return { program, task, requestId, studentIds, count: data.count as number, recognitionMode: data.recognitionMode as "observation" | "offline", activityDate: data.activityDate as string, memo: (data.memo as string | undefined)?.trim() ?? "" };
}
export function canBulkRecognize(staff: StaffDoc, grade: number, classNo: number, program: string): boolean {
  return staff.status === "active" && (staff.role === "admin" || (staff.role === "teacher" && Array.isArray(staff.bulkRecognitionPrograms) && staff.bulkRecognitionPrograms.includes(program) && (
    (staff.homeroom === true && staff.grade === grade && staff.classNo === classNo) ||
    (staff.subject === true && staff.grades?.includes(grade) === true && staff.programs?.includes(program) === true
      && (staff.subjectClasses === undefined || (Array.isArray(staff.subjectClasses) && (staff.subjectClasses.length === 0 || staff.subjectClasses.some((item) => item !== null && typeof item === "object" && Object.keys(item).length === 2 && item.grade === grade && item.classNo === classNo)))))
  )));
}
export function validateBulkStudent(input: ReturnType<typeof validateBulkInput>, program: ProgramDef | undefined, student: Record<string, unknown>, staff: StaffDoc, year: number, today: string) {
  const { grade, classNo } = student;
  if (!Number.isInteger(year) || year < 2000 || year > 9998 || input.activityDate < `${year}-03-01` || input.activityDate >= `${year + 1}-03-01` || input.activityDate > today) invalid("현재 학년도 안의 오늘 이전 날짜를 선택해 주세요.");
  if (student.active !== true || student.year !== year || typeof grade !== "number" || !Number.isInteger(grade) || grade < 1 || grade > 6 || typeof classNo !== "number" || !Number.isInteger(classNo) || classNo < 1) invalid("현재 학년도 학생 명단을 확인해 주세요.");
  if (!program || !program.enabled || !program.grades.includes(grade as number)) invalid("학생이 참여할 수 없는 인증 항목이에요.");
  if (program!.kind === "tasks" ? !program!.tasks?.some((task) => task.id === input.task) : input.task !== undefined) invalid("인정할 세부 과제를 선택해 주세요.");
  if (!canBulkRecognize(staff, grade as number, classNo as number, input.program)) throw new HttpsError("permission-denied", "이 항목의 일괄 인정 권한과 담당 학생 범위를 확인해 주세요.");
}
export function bulkFingerprint(input: ReturnType<typeof validateBulkInput>, year: number): string {
  const { requestId: _requestId, ...payload } = input;
  return digest({ ...payload, studentIds: [...payload.studentIds].sort(), year });
}
export function existingBulkOperation(saved: { fingerprint?: unknown; count?: unknown } | undefined, fingerprint: string): number | undefined {
  if (!saved) return undefined;
  if (saved.fingerprint !== fingerprint || typeof saved.count !== "number") throw new HttpsError("already-exists", "이 요청 번호로 다른 기록이 처리되었어요. 화면을 새로 열어 주세요.");
  return saved.count;
}

export const bulkRecognize = onCall({ region: REGION, maxInstances: 5, concurrency: 20, timeoutSeconds: 60 }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const schoolId = requireSchoolId(req.data);
  const input = validateBulkInput((req.data ?? {}) as Record<string, unknown>);
  const uid = req.auth.uid;
  const operationRef = db.doc(sp(schoolId, `bulkRecognitionOperations/${digest([uid, input.requestId])}`));
  const studentRefs = input.studentIds.map((sid) => db.doc(sp(schoolId, `students/${sid}`)));
  return db.runTransaction(async (tx) => {
    const [school, staffSnap, superSnap, config, operation, ...students] = await tx.getAll(
      db.doc(sp(schoolId)), db.doc(sp(schoolId, `staff/${uid}`)), db.doc(`superAdmins/${uid}`), db.doc(sp(schoolId, "config/app")), operationRef, ...studentRefs,
    );
    if (school.get("status") !== "active") throw new HttpsError("failed-precondition", "운영 중인 학교만 사용할 수 있어요.");
    const staff = (superSnap.exists ? { role: "admin", status: "active", name: "플랫폼 운영자" } : staffSnap.data()) as StaffDoc | undefined;
    if (!staff || staff.status !== "active" || !["admin", "teacher"].includes(staff.role)) throw new HttpsError("permission-denied", "승인된 교사만 사용할 수 있어요.");
    const year = school.get("year") as number;
    const program = mergeConfig(config.data() as Partial<AppConfig> | undefined).programs.find((p) => p.id === input.program);
    for (const student of students) validateBulkStudent(input, program, student.data() ?? {}, staff, year, todayKey());
    const fingerprint = bulkFingerprint(input, year);
    const existing = existingBulkOperation(operation.data(), fingerprint);
    if (existing !== undefined) return { count: existing, existing: true };
    students.forEach((student) => {
      const ref = db.doc(sp(schoolId, `submissions/bulk_${digest([uid, input.requestId, student.id])}`));
      tx.create(ref, {
        sid: student.id, year, grade: student.get("grade"), classNo: student.get("classNo"), program: input.program,
        ...(input.task ? { task: input.task } : {}), source: "teacher", status: "active", count: input.count,
        activityDate: input.activityDate, recognitionMode: input.recognitionMode, text: input.memo,
        createdBy: uid, createdByName: staff.name ?? "교사", reviewedBy: uid, reviewedByName: staff.name ?? "교사",
        createdAt: FieldValue.serverTimestamp(), reviewedAt: FieldValue.serverTimestamp(),
      });
    });
    tx.create(operationRef, { fingerprint, count: students.length, createdBy: uid, year, program: input.program, createdAt: FieldValue.serverTimestamp() });
    return { count: students.length, existing: false };
  });
});
