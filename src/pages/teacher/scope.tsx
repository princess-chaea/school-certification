import { ProgramFilter } from "../../components/ProgramFilter";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { StaffDoc } from "../../lib/types";
import { classesOf, GRADES } from "../../lib/classes";
import { useConfig } from "../../lib/config";
import { activePrograms } from "../../../shared/domain";
import { PixelIcon } from "../../components/Pixel";

/** 교사가 지금 보고 있는 범위. 관리자·담임·전담 업무는 겹칠 수 있다. */
export interface Scope {
  grade: number;
  classNo: number | null; // null = 학년 전체
  program: string | null; // null = 전 항목
}

interface ScopeCtxValue {
  staff: StaffDoc;
  scope: Scope;
  setScope: (s: Scope) => void;
  isAdmin: boolean;
  allowedGrades: number[];
  /** 지금 범위에서 분야 필터가 꼭 필요한가 (전담으로만 보는 학급) */
  programRequired: boolean;
  allowedPrograms: string[] | null; // null = 전체
  canSeeAllClasses: boolean;
  allowedClasses: number[];
  canQuery: boolean;
}

const Ctx = createContext<ScopeCtxValue | null>(null);
export function useScope() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ScopeProvider missing");
  return v;
}

export function canTeachClassProgram(staff: StaffDoc, grade: number, classNo: number, program?: string | null) {
  return staff.role === "admin" || Boolean(
    (staff.homeroom && staff.grade === grade && staff.classNo === classNo) ||
    (staff.subject && staff.grades?.includes(grade) && (!program || staff.programs?.includes(program)) &&
      (!staff.subjectClasses?.length || staff.subjectClasses.some((c) => c.grade === grade && c.classNo === classNo))),
  );
}

export function resolveTeachingScope(staff: StaffDoc, requested: Scope, programs: Array<{ id: string; grades: number[] }>) {
  const isAdmin = staff.role === "admin";
  const home = staff.homeroom && staff.grade && staff.classNo ? { grade: staff.grade, classNo: staff.classNo } : null;
  const restricted = Boolean(staff.subjectClasses?.length);
  const subjGrades = staff.subject ? (staff.grades ?? []).filter((g) =>
    programs.some((p) => staff.programs?.includes(p.id) && p.grades.includes(g)) &&
    (!restricted || staff.subjectClasses?.some((c) => c.grade === g && c.classNo > 0)),
  ) : [];
  const allowedGrades = isAdmin ? GRADES : [...new Set([...(home ? [home.grade] : []), ...subjGrades])].sort((a, b) => a - b);
  const grade = allowedGrades.includes(requested.grade) ? requested.grade : home?.grade ?? allowedGrades[0] ?? 1;
  const canSeeAllClasses = isAdmin || (subjGrades.includes(grade) && !restricted);
  const allowedClasses = [...new Set([
    ...(canSeeAllClasses ? classesOf(grade) : subjGrades.includes(grade) ? (staff.subjectClasses ?? []).filter((c) => c.grade === grade).map((c) => c.classNo) : []),
    ...(home?.grade === grade ? [home.classNo] : []),
  ])].sort((a, b) => a - b);
  const classNo = requested.classNo && allowedClasses.includes(requested.classNo) ? requested.classNo : canSeeAllClasses ? null : home?.grade === grade ? home.classNo : allowedClasses[0] ?? null;
  const scope: Scope = { grade, classNo, program: requested.program };
  const inHome = Boolean(home && scope.grade === home.grade && scope.classNo === home.classNo);
  const programRequired = !isAdmin && !inHome;
  const eligiblePrograms = programs.filter((p) => p.grades.includes(grade));
  const allowedPrograms = programRequired ? eligiblePrograms.filter((p) => staff.programs?.includes(p.id)).map((p) => p.id) : null;
  if (programRequired && (!scope.program || !allowedPrograms?.includes(scope.program))) scope.program = allowedPrograms?.[0] ?? null;
  else if (scope.program && !eligiblePrograms.some((p) => p.id === scope.program)) scope.program = null;
  return { scope, isAdmin, allowedGrades, programRequired, allowedPrograms, canSeeAllClasses, allowedClasses, canQuery: allowedGrades.length > 0 && (!programRequired || Boolean(allowedPrograms?.length)) };
}

export function ScopeProvider({ staff, children }: { staff: StaffDoc; children: ReactNode }) {
  const config = useConfig();
  const [requested, setScope] = useState<Scope>(() => ({ grade: staff.homeroom ? staff.grade ?? 0 : 0, classNo: staff.homeroom ? staff.classNo ?? null : null, program: null }));
  const value: ScopeCtxValue = {
    staff,
    ...resolveTeachingScope(staff, requested, activePrograms(config)),
    setScope,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 범위 선택 막대 (학년·반·항목) */
export function ScopeBar({ showProgram = true, only }: { showProgram?: boolean; only?: (p: { kind: string; id: string }) => boolean }) {
  const { staff, scope, setScope, isAdmin, allowedGrades, programRequired, allowedPrograms, canSeeAllClasses, allowedClasses } = useScope();
  const config = useConfig();
  const home = staff.homeroom && staff.grade ? { grade: staff.grade, classNo: staff.classNo! } : null;
  const programs = activePrograms(config, scope.grade).filter((p) => (allowedPrograms ? allowedPrograms.includes(p.id) : true)).filter((p) => (only ? only(p) : true));
  const fixed = !isAdmin && allowedGrades.length === 1 && !canSeeAllClasses && allowedClasses.length === 1;
  return (
    <div className="scope-bar">
      <PixelIcon name="search" size={20} />
      {fixed ? (
        <span className="chip" style={{ fontSize: ".9rem", padding: "6px 12px" }}>{scope.grade}학년 {scope.classNo}반</span>
      ) : (
        <>
          <select className="input sm" value={scope.grade} onChange={(e) => {
            const g = Number(e.target.value);
            setScope({ ...scope, grade: g, classNo: null });
          }} aria-label="학년">
            {allowedGrades.map((g) => <option key={g} value={g}>{g}학년</option>)}
          </select>
          <select className="input sm" value={scope.classNo ?? ""} onChange={(e) => setScope({ ...scope, classNo: e.target.value ? Number(e.target.value) : null })} aria-label="반">
            {canSeeAllClasses && <option value="">전체 반</option>}
            {allowedClasses.map((c) => <option key={c} value={c}>{c}반{home && home.grade === scope.grade && home.classNo === c ? " (담임)" : ""}</option>)}
          </select>
        </>
      )}
      {showProgram && (
        <ProgramFilter programs={programs} value={scope.program} onChange={(id) => setScope({ ...scope, program: id })} allLabel={programRequired ? null : "전체"} />
      )}
    </div>
  );
}
