import { createContext, useContext, useState, type ReactNode } from "react";
import type { ProgramId, StaffDoc } from "../../lib/types";
import { classesOf, GRADES } from "../../lib/classes";
import { useConfig } from "../../lib/config";

/** 교사가 지금 보고 있는 범위 (담임: 자기 반 고정 / 전담: 담당 학년·분야 / 관리자: 전체) */
export interface Scope {
  grade: number;
  classNo: number | null; // null = 학년 전체
  program: ProgramId | null; // null = 전 분야 (담임·관리자만)
}

interface ScopeCtxValue {
  staff: StaffDoc;
  scope: Scope;
  setScope: (s: Scope) => void;
  isAdmin: boolean;
  allowedGrades: number[];
  allowedPrograms: ProgramId[];
  /** 분야 필터가 꼭 필요한가 (전담은 담당 분야만 볼 수 있음) */
  programRequired: boolean;
}

const Ctx = createContext<ScopeCtxValue | null>(null);
export function useScope() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ScopeProvider missing");
  return v;
}

export function ScopeProvider({ staff, children }: { staff: StaffDoc; children: ReactNode }) {
  const isAdmin = staff.role === "admin";
  const homeroom = !isAdmin && staff.teacherType === "homeroom";
  const allowedGrades = isAdmin ? GRADES : homeroom ? [staff.grade!] : (staff.grades ?? []);
  const allowedPrograms: ProgramId[] = isAdmin || homeroom ? ["reading", "carbon", "english"] : ((staff.programs ?? []) as ProgramId[]);
  const programRequired = !isAdmin && !homeroom;
  const [scope, setScope] = useState<Scope>({
    grade: homeroom ? staff.grade! : allowedGrades[0] ?? 3,
    classNo: homeroom ? staff.classNo! : isAdmin ? null : null,
    program: programRequired ? allowedPrograms[0] ?? null : null,
  });
  return <Ctx.Provider value={{ staff, scope, setScope, isAdmin, allowedGrades, allowedPrograms, programRequired }}>{children}</Ctx.Provider>;
}

/** 범위 선택 막대 (학년·반·분야) */
export function ScopeBar({ showProgram = true, programs }: { showProgram?: boolean; programs?: ProgramId[] }) {
  const { staff, scope, setScope, isAdmin, allowedGrades, allowedPrograms, programRequired } = useScope();
  const config = useConfig();
  const homeroom = !isAdmin && staff.teacherType === "homeroom";
  const progList = (programs ?? allowedPrograms).filter((p) => allowedPrograms.includes(p));
  return (
    <div className="scope-bar">
      {homeroom ? (
        <span className="chip" style={{ fontSize: ".9rem", padding: "6px 12px" }}>{scope.grade}학년 {scope.classNo}반</span>
      ) : (
        <>
          <select className="input sm" value={scope.grade} onChange={(e) => setScope({ ...scope, grade: Number(e.target.value), classNo: null })} aria-label="학년">
            {allowedGrades.map((g) => <option key={g} value={g}>{g}학년</option>)}
          </select>
          <select className="input sm" value={scope.classNo ?? ""} onChange={(e) => setScope({ ...scope, classNo: e.target.value ? Number(e.target.value) : null })} aria-label="반">
            <option value="">전체 반</option>
            {classesOf(scope.grade).map((c) => <option key={c} value={c}>{c}반</option>)}
          </select>
        </>
      )}
      {showProgram && (
        <div className="row" style={{ gap: 6 }}>
          {!programRequired && (
            <button className={`choice ${scope.program === null ? "on" : ""}`} onClick={() => setScope({ ...scope, program: null })}>전체</button>
          )}
          {progList.map((p) => (
            <button key={p} className={`choice ${scope.program === p ? "on" : ""}`} onClick={() => setScope({ ...scope, program: p })}>
              {config.programs[p].emoji} {config.programs[p].name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
