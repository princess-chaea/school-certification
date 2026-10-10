import { useNavigate } from "react-router-dom";
import { where, orderBy, type QueryConstraint } from "firebase/firestore";
import { useCollection } from "../../lib/data";
import { sp, useSchoolId } from "../../lib/tenant";
import { useConfig } from "../../lib/config";
import { useSchool } from "../../lib/school";
import type { StudentDoc } from "../../lib/types";
import { MedalBadge, Empty } from "../../components/ui";
import { PageHeader } from "../../components/Layout";
import { PixelIcon } from "../../components/Pixel";
import { ScopeBar, useScope } from "./scope";
import { MEDAL_LABEL, isCertified, activePrograms, type Medal, type ProgramDef } from "../../../shared/domain";

export function useScopedStudents() {
  const schoolId = useSchoolId();
  const { scope } = useScope();
  const cons: QueryConstraint[] = [where("grade", "==", scope.grade)];
  if (scope.classNo) cons.push(where("classNo", "==", scope.classNo), orderBy("number"));
  const res = useCollection<StudentDoc & { id: string }>(sp(schoolId, "students"), cons, [schoolId, scope.grade, scope.classNo]);
  const rows = res.rows?.filter((s) => s.active !== false).sort((a, b) => a.classNo - b.classNo || a.number - b.number) ?? null;
  return { rows, error: res.error };
}

export const medalOf = (s: StudentDoc, id: string): Medal | undefined => s.progress?.[id]?.medal;
export const countOf = (s: StudentDoc, id: string): number => s.progress?.[id]?.count ?? 0;

export function MedalDistribution({ students, program }: { students: StudentDoc[]; program: ProgramDef }) {
  const eligible = students.filter((s) => program.grades.includes(s.grade));
  const counts: Record<Medal, number> = { none: 0, bronze: 0, silver: 0, gold: 0 };
  eligible.forEach((s) => counts[medalOf(s, program.id) ?? "none"]++);
  const total = eligible.length || 1;
  const certified = counts.bronze + counts.silver + counts.gold;
  const participants = eligible.filter((s) => countOf(s, program.id) > 0).length;
  return (
    <div className="card px-card stack" style={{ gap: 8 }}>
      <div className="row between">
        <b className="icon-text"><PixelIcon name={program.icon} size={22} /> {program.name}</b>
        <span className="small muted">참여 {participants}/{eligible.length}명 · 인증 <b style={{ color: "var(--ink)" }}>{certified}명</b></span>
      </div>
      {eligible.length === 0 ? (
        <span className="small muted">대상 학년이 아니에요.</span>
      ) : (
        <>
          <div className="medalbar" role="img" aria-label={`도전 중 ${counts.none}, 동 ${counts.bronze}, 은 ${counts.silver}, 금 ${counts.gold}`}>
            {(["gold", "silver", "bronze", "none"] as Medal[]).map((m) => (counts[m] ? <div key={m} className={m} style={{ width: `${(counts[m] / total) * 100}%` }} title={`${MEDAL_LABEL[m]} ${counts[m]}명`} /> : null))}
          </div>
          <div className="legend">
            {(["gold", "silver", "bronze", "none"] as Medal[]).map((m) => (
              <span key={m}><i style={{ background: `var(--${m === "none" ? "line" : m})` }} />{MEDAL_LABEL[m]}{m === "none" ? "" : "장"} {counts[m]}명</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function Overview() {
  const nav = useNavigate();
  const config = useConfig();
  const school = useSchool();
  const { scope } = useScope();
  const { rows } = useScopedStudents();
  const all = activePrograms(config, scope.grade);
  const programs = scope.program ? all.filter((p) => p.id === scope.program) : all;
  const list = rows ?? [];
  const anyCert = list.filter((s) => programs.some((p) => isCertified(medalOf(s, p.id)))).length;
  const participants = list.filter((s) => programs.some((p) => countOf(s, p.id) > 0)).length;
  const loggedIn = list.filter((s) => s.hasAccount).length;

  return (
    <div className="page">
      <PageHeader icon="chart" title={`${scope.grade}학년 ${scope.classNo ? `${scope.classNo}반` : "전체"} 현황`} right={<span className="chip gray hud">{school.year}</span>} />
      <ScopeBar />
      {rows === null ? (
        <div className="muted">불러오는 중…</div>
      ) : list.length === 0 ? (
        <Empty icon="users">명단에 학생이 없어요. 학교 담당자에게 명단(CSV) 등록을 요청하세요.</Empty>
      ) : (
        <>
          <div className="grid grid-4">
            <div className="tile px-card"><div className="k">학생</div><div className="v hud">{list.length}</div><div className="s">앱 접속 {loggedIn}명</div></div>
            <div className="tile px-card"><div className="k">참여율</div><div className="v hud">{Math.round((participants / list.length) * 100)}%</div><div className="s">기록 1건 이상 {participants}명</div></div>
            <div className="tile px-card"><div className="k">인증률 (1개 항목 이상)</div><div className="v hud">{participants ? Math.round((anyCert / participants) * 100) : 0}%</div><div className="s">인증 {anyCert}명 / 참여 {participants}명</div></div>
            <div className="tile px-card"><div className="k">인증 기준</div><div className="v" style={{ fontSize: "1.05rem", paddingTop: 8 }}>동장 = 계획서 기준</div><div className="s">은 ×{config.medalMultipliers.silver} · 금 ×{config.medalMultipliers.gold}</div></div>
          </div>
          <div className="grid grid-3" style={{ marginTop: 14 }}>
            {programs.map((p) => <MedalDistribution key={p.id} students={list} program={p} />)}
          </div>
          <div className="section-title">학생별 현황</div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>반</th><th>번호</th><th>이름</th>
                  {programs.map((p) => <th key={p.id}><span className="icon-text"><PixelIcon name={p.icon} size={16} />{p.name}</span></th>)}
                  <th>접속</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="clickable" onClick={() => nav(`/student/${encodeURIComponent(s.id)}`)}>
                    <td>{s.classNo}</td>
                    <td className="num">{s.number}</td>
                    <td><b>{s.name || <span className="muted">(이름 입력 전)</span>}</b> {s.isDemo && <span className="chip demo">예시</span>}</td>
                    {programs.map((p) => p.grades.includes(s.grade) ? (
                      <td key={p.id}><span className="cell-medal"><MedalBadge medal={medalOf(s, p.id) ?? "none"} size={24} />{countOf(s, p.id)}{p.kind === "tasks" ? "과제" : p.unit}</span></td>
                    ) : <td key={p.id} className="muted">-</td>)}
                    <td>{s.hasAccount ? <PixelIcon name="check" size={16} /> : s.email ? "미접속" : "계정 없음"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
