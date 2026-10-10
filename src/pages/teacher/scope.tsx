import { createContext, useContext, useState, type ReactNode } from "react";
import type { StaffDoc } from "../../lib/types";
import { classesOf, GRADES } from "../../lib/classes";
import { useConfig } from "../../lib/config";
import { activePrograms } from "../../../shared/domain";
import { PixelIcon } from "../../components/Pixel";

/** 교사가 지금 보고 있는 범위. 역할이 겹칠 수 있다(학교 담당자 / 담임 / 전담) */
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
}

const Ctx = createContext<ScopeCtxValue | null>(null);
export function useScope() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ScopeProvider missing");
  return v;
}

export function ScopeProvider({ staff, children }: { staff: StaffDoc; children: ReactNode }) {
  const isAdmin = staff.role === "admin";
  const home = staff.homeroom && staff.grade ? { grade: staff.grade, classNo: staff.classNo! } : null;
  const subjGrades = staff.subject ? staff.grades ?? [] : [];
  const allowedGrades = isAdmin ? GRADES : [...new Set([...(home ? [home.grade] : []), ...subjGrades])].sort();
  const [scope, setScope] = useState<Scope>(() => {
    if (home) return { grade: home.grade, classNo: home.classNo, program: null };
    return { grade: allowedGrades[0] ?? 1, classNo: null, program: isAdmin ? null : staff.programs?.[0] ?? null };
  });
  const inHome = Boolean(home && scope.grade === home.grade && scope.classNo === home.classNo);
  const programRequired = !isAdmin && !inHome;
  const allowedPrograms = programRequired ? staff.programs ?? [] : null;
  const canSeeAllClasses = isAdmin || subjGrades.includes(scope.grade);
  const value: ScopeCtxValue = {
    staff,
    scope: programRequired && (!scope.program || !allowedPrograms?.includes(scope.program)) ? { ...scope, program: allowedPrograms?.[0] ?? null } : scope,
    setScope,
    isAdmin,
    allowedGrades,
    programRequired,
    allowedPrograms,
    canSeeAllClasses,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 범위 선택 막대 (학년·반·항목) */
export function ScopeBar({ showProgram = true, only }: { showProgram?: boolean; only?: (p: { kind: string; id: string }) => boolean }) {
  const { staff, scope, setScope, isAdmin, allowedGrades, programRequired, allowedPrograms, canSeeAllClasses } = useScope();
  const config = useConfig();
  const home = staff.homeroom && staff.grade ? { grade: staff.grade, classNo: staff.classNo! } : null;
  const programs = activePrograms(config, scope.grade).filter((p) => (allowedPrograms ? allowedPrograms.includes(p.id) : true)).filter((p) => (only ? only(p) : true));
  const fixed = !isAdmin && allowedGrades.length === 1 && !canSeeAllClasses && home;
  return (
    <div className="scope-bar">
      <PixelIcon name="search" size={20} />
      {fixed ? (
        <span className="chip" style={{ fontSize: ".9rem", padding: "6px 12px" }}>{scope.grade}학년 {scope.classNo}반</span>
      ) : (
        <>
          <select className="input sm" value={scope.grade} onChange={(e) => {
            const g = Number(e.target.value);
            setScope({ ...scope, grade: g, classNo: home && home.grade === g && !isAdmin && !(staff.grades ?? []).includes(g) ? home.classNo : null });
          }} aria-label="학년">
            {allowedGrades.map((g) => <option key={g} value={g}>{g}학년</option>)}
          </select>
          <select className="input sm" value={scope.classNo ?? ""} onChange={(e) => setScope({ ...scope, classNo: e.target.value ? Number(e.target.value) : null })} aria-label="반">
            {canSeeAllClasses && <option value="">전체 반</option>}
            {classesOf(scope.grade).filter((c) => canSeeAllClasses || (home && home.grade === scope.grade && home.classNo === c)).map((c) => <option key={c} value={c}>{c}반{home && home.grade === scope.grade && home.classNo === c ? " (담임)" : ""}</option>)}
          </select>
        </>
      )}
      {showProgram && (
        <div className="row" style={{ gap: 6 }}>
          {!programRequired && <button className={`choice ${scope.program === null ? "on" : ""}`} onClick={() => setScope({ ...scope, program: null })}>전체</button>}
          {programs.map((p) => (
            <button key={p.id} className={`choice ${scope.program === p.id ? "on" : ""}`} onClick={() => setScope({ ...scope, program: p.id })}>
              <PixelIcon name={p.icon} size={16} /> {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
