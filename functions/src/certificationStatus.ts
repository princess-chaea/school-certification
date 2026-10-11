import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, REGION, requireSchoolId, sp, type StaffDoc } from "./common.js";
import { computeProgress, mergeConfig, type AppConfig, type StudentProgress } from "./shared/domain.js";

export function validateStatusInput(data: Record<string, unknown>) {
  const { program, year, grade, classNo } = data;
  if (typeof program !== "string" || !program.trim() || program.length > 40 || program.includes("/")) throw new HttpsError("invalid-argument", "인증 항목을 선택해 주세요.");
  if (typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 9998) throw new HttpsError("invalid-argument", "학년도를 확인해 주세요.");
  if (grade !== undefined && (typeof grade !== "number" || !Number.isInteger(grade) || grade < 1 || grade > 6)) throw new HttpsError("invalid-argument", "학년을 확인해 주세요.");
  if (classNo !== undefined && (grade === undefined || typeof classNo !== "number" || !Number.isInteger(classNo) || classNo < 1 || classNo > 99)) throw new HttpsError("invalid-argument", "학년과 반을 확인해 주세요.");
  return { program, year, grade: grade as number | undefined, classNo: classNo as number | undefined };
}

export function canViewCertificationStatus(staff: StaffDoc | undefined, program: string): boolean {
  return staff?.status === "active" && (staff.role === "admin" || (staff.role === "teacher" && Array.isArray(staff.certificationPrograms) && staff.certificationPrograms.includes(program)));
}

const emptyCounts = () => ({ students: 0, participants: 0, certified: 0, none: 0, bronze: 0, silver: 0, gold: 0 });
export function aggregateCertificationStatus(config: AppConfig, input: ReturnType<typeof validateStatusInput>, students: Record<string, unknown>[]) {
  const program = config.programs.find((p) => p.id === input.program && p.enabled);
  if (!program) throw new HttpsError("not-found", "운영 중인 인증 항목을 찾을 수 없어요.");
  const totals = emptyCounts();
  const classes = new Map<string, ReturnType<typeof emptyCounts> & { grade: number; classNo: number }>();
  for (const student of students) {
    const grade = student.grade as number;
    const classNo = student.classNo as number;
    if (student.active !== true || student.isDemo === true || student.year !== input.year || !Number.isInteger(grade) || !Number.isInteger(classNo) || classNo < 1 || classNo > 99 || !program.grades.includes(grade)) continue;
    if ((input.grade !== undefined && grade !== input.grade) || (input.classNo !== undefined && classNo !== input.classNo)) continue;
    const saved = (student.progress as StudentProgress | undefined)?.[program.id];
    const counts = program.kind === "tasks" ? saved?.tasks ?? {} : saved?.count ?? 0;
    const progress = computeProgress(config, grade, { [program.id]: counts })[program.id];
    if (!progress) continue;
    // A partially completed task is participation even before one whole task is done.
    const participated = progress.count > 0 || Object.values(progress.tasks ?? {}).some((count) => count > 0);
    const key = `${grade}-${classNo}`;
    const row = classes.get(key) ?? { grade, classNo, ...emptyCounts() };
    for (const target of [totals, row]) {
      target.students++;
      if (participated) target.participants++;
      target[progress.medal]++;
      if (progress.medal !== "none") target.certified++;
    }
    classes.set(key, row);
  }
  return { program: input.program, year: input.year, totals, classes: [...classes.values()].sort((a, b) => a.grade - b.grade || a.classNo - b.classNo) };
}

export const certificationStatus = onCall({ region: REGION, maxInstances: 5, concurrency: 20, timeoutSeconds: 60 }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const schoolId = requireSchoolId(req.data);
  const input = validateStatusInput((req.data ?? {}) as Record<string, unknown>);
  const [school, staff, config] = await Promise.all([
    db.doc(sp(schoolId)).get(),
    db.doc(sp(schoolId, `staff/${req.auth.uid}`)).get(),
    db.doc(sp(schoolId, "config/app")).get(),
  ]);
  if (!canViewCertificationStatus(staff.data() as StaffDoc | undefined, input.program)) throw new HttpsError("permission-denied", "이 항목의 인증 업무 담당 또는 관리자만 조회할 수 있어요.");
  if (school.get("status") !== "active" || school.get("year") !== input.year) throw new HttpsError("failed-precondition", "현재 운영 학년도의 현황만 조회할 수 있어요.");
  const merged = mergeConfig(config.data() as Partial<AppConfig> | undefined);
  if (!merged.programs.some((p) => p.id === input.program && p.enabled)) throw new HttpsError("not-found", "운영 중인 인증 항목을 찾을 수 없어요.");
  // One school-local read, with only the fields needed for anonymous aggregation.
  const students = await db.collection(sp(schoolId, "students")).where("year", "==", input.year)
    .select("year", "active", "isDemo", "grade", "classNo", "progress").get();
  return aggregateCertificationStatus(merged, input, students.docs.map((doc) => doc.data()));
});
