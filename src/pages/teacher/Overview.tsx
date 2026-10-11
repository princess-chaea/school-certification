import { useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";
import { where, orderBy, type QueryConstraint } from "firebase/firestore";
import { useCollection } from "../../lib/data";
import { sp, useSchoolId } from "../../lib/tenant";
import { useConfig } from "../../lib/config";
import { useSchool } from "../../lib/school";
import type { StudentDoc } from "../../lib/types";
import { MedalBadge, Empty, toast } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { functions } from "../../firebase";
import { createNameRosterCsv, decodeNameRosterCsv, parseNameRosterCsv, NAME_ROSTER_LIMIT, type NameRosterStudent, type NameRosterUpdate } from "../../lib/nameRosterCsv";
import "./NameRosterCsv.css";
import { PageHeader } from "../../components/Layout";
import { PixelIcon } from "../../components/Pixel";
import { ScopeBar, useScope, canTeachClassProgram } from "./scope";
import { MEDAL_LABEL, isCertified, activePrograms, type Medal, type ProgramDef } from "../../../shared/domain";

export function useScopedStudents() {
  const schoolId = useSchoolId();
  const { scope, staff, canQuery } = useScope();
  const cons: QueryConstraint[] = [where("grade", "==", scope.grade)];
  if (scope.classNo) cons.push(where("classNo", "==", scope.classNo), orderBy("number"));
  const res = useCollection<StudentDoc & { id: string }>(canQuery ? sp(schoolId, "students") : null, cons, [schoolId, scope.grade, scope.classNo, canQuery]);
  const rows = canQuery ? res.rows?.filter((s) => s.active !== false && s.grade === scope.grade && (!scope.classNo || s.classNo === scope.classNo) && canTeachClassProgram(staff, s.grade, s.classNo, scope.program)).sort((a, b) => a.classNo - b.classNo || a.number - b.number) ?? null : [];
  return { rows, error: res.error };
}

export const medalOf = (s: StudentDoc, id: string): Medal | undefined => s.progress?.[id]?.medal;
export const countOf = (s: StudentDoc, id: string): number => s.progress?.[id]?.count ?? 0;

function NameRosterControls({ students }: { students: NameRosterStudent[] }) {
  const schoolId = useSchoolId();
  const { scope } = useScope();
  const input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ text: string; rows: NameRosterUpdate[]; unchanged: number } | null>(null);
  const oversized = students.length > NAME_ROSTER_LIMIT;
  const empty = students.length === 0;

  function download() {
    const url = URL.createObjectURL(new Blob([createNameRosterCsv(students)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `학생이름_${scope.grade}학년_${scope.classNo ? `${scope.classNo}반` : "전체반"}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function choose(file?: File) {
    if (!file) return;
    setError("");
    setPreview(null);
    try {
      if (file.size > 1024 * 1024) throw new Error("CSV 파일은 1MB 이하로 올려 주세요.");
      const text = decodeNameRosterCsv(await file.arrayBuffer());
      const parsed = parseNameRosterCsv(text, students);
      if (!parsed.rows.length) { toast("바뀐 이름이 없어요. 빈 이름 칸은 기존 이름을 유지해요."); return; }
      setPreview({ text, ...parsed });
    } catch (e) { setError((e as Error).message); }
  }

  async function save() {
    if (!preview || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const parsed = parseNameRosterCsv(preview.text, students);
      if (!parsed.rows.length) { setPreview(null); toast("이미 같은 이름으로 저장되어 있어요."); return; }
      const result = await httpsCallable<unknown, { updated: number; unchanged: number }>(functions, "updateClassStudentNames")({ schoolId, grade: scope.grade, classNo: scope.classNo, rows: parsed.rows });
      setPreview(null);
      toast(`${result.data.updated}명의 이름을 저장했어요. 활동 기록과 계정은 그대로 유지돼요.`);
    } catch (e) { setError("이름을 저장하지 못했어요: " + (e as Error).message); }
    finally { saving.current = false; setBusy(false); }
  }

  return <>
    <div className="name-roster-heading">
      <div className="section-title">학생별 현황</div>
      <div className="name-roster-actions">
        <button className="btn secondary sm" onClick={download} disabled={busy || oversized || empty}><PixelIcon name="download" size={16} /> 이름 CSV 내려받기</button>
        <button className="btn sm" onClick={() => input.current?.click()} disabled={busy || oversized || empty}><PixelIcon name="upload" size={16} /> 이름 CSV 올리기</button>
        <input ref={input} type="file" accept=".csv,text/csv" hidden aria-label="학생 이름 CSV 파일" onChange={(e) => { void choose(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
      </div>
    </div>
    <p className="name-roster-help small muted">현재 범위의 실제 학생 {students.length}명 · CSV의 <strong>이름 칸만</strong> 입력 후 올려 주세요. 빈칸은 유지되며, 이메일·활동 기록·인증 진행도는 바뀌지 않아요.</p>
    {empty && <p className="name-roster-help small muted">예시 학생은 이름 CSV에서 제외돼요. 실제 학생 명단을 등록해 주세요.</p>}
    {oversized && <p className="name-roster-error" role="status">한 번에 400명까지 입력할 수 있어요. 위에서 반을 선택해 주세요.</p>}
    {error && !preview && <p className="name-roster-error" role="alert">{error}</p>}
    {preview && <Modal title="학생 이름 변경 확인" icon="users" onClose={() => { if (!saving.current) setPreview(null); }}>
      <p>이름 {preview.rows.length}개를 변경해요. 빈칸·동일 이름 {preview.unchanged}개는 그대로 유지해요.</p>
      <div className="name-roster-preview">
        {preview.rows.map((row) => <div key={row.sid}><b>{row.grade}학년 {row.classNo}반 {row.number}번</b><span>{students.find((s) => s.id === row.sid)?.name || "(이름 입력 전)"} → <strong>{row.name}</strong></span></div>)}
      </div>
      {error && <p className="name-roster-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="btn" disabled={busy} onClick={() => void save()}>{busy ? "저장 중…" : `${preview.rows.length}명 이름 저장`}</button>
        <button className="btn ghost" disabled={busy} onClick={() => setPreview(null)}>취소</button>
      </div>
    </Modal>}
  </>;
}

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
  const nameRosterStudents = list.filter((s) => !s.isDemo);
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
        <Empty icon="users">명단에 학생이 없어요. 관리자에게 명단(CSV) 등록을 요청하세요.</Empty>
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
          <NameRosterControls key={`${scope.grade}-${scope.classNo}-${scope.program}`} students={nameRosterStudents} />
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
