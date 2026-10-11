import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import { useSchoolId } from "../../lib/tenant";
import { useConfig } from "../../lib/config";
import { useSchool } from "../../lib/school";
import { Empty, toast } from "../../components/ui";
import { askConfirm } from "../../components/Modal";
import { PageHeader } from "../../components/Layout";
import { PixelIcon } from "../../components/Pixel";
import { ScopeBar, useScope, canTeachClassProgram } from "./scope";
import { useScopedStudents, countOf } from "./Overview";
import { activePrograms } from "../../../shared/domain";

function today() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type BulkRequest = {
  schoolId: string; program: string; task?: string; studentIds: string[];
  count: number; activityDate: string; memo: string;
  recognitionMode: "observation" | "offline"; requestId: string;
};
type Pending = { requests: BulkRequest[]; completed: number; label: string; failure?: string };
const recoverableRejections = new Set(["functions/invalid-argument", "functions/permission-denied", "functions/failed-precondition", "functions/already-exists", "functions/not-found"]);

/** 관찰 기록과 온라인 도입 전의 활동을 교사가 확인해 인정한다. */
export function Bulk() {
  const schoolId = useSchoolId();
  const config = useConfig();
  const school = useSchool();
  const minDate = `${school.year}-03-01`;
  const yearEnd = new Date(Date.UTC(school.year + 1, 2, 0)).toISOString().slice(0, 10);
  const maxDate = today() < yearEnd ? today() : yearEnd;
  const { scope, staff, isAdmin, allowedPrograms } = useScope();
  const { rows, error } = useScopedStudents();
  const granted = (id: string) => isAdmin || Boolean(staff.bulkRecognitionPrograms?.includes(id));
  const programs = activePrograms(config, scope.grade).filter((p) => granted(p.id) && (!allowedPrograms || allowedPrograms.includes(p.id)));
  const [programId, setProgramId] = useState("");
  const program = programs.find((p) => p.id === programId) ?? programs.find((p) => p.id === scope.program) ?? programs[0];
  const [taskId, setTaskId] = useState("");
  const task = program?.kind === "tasks" ? program.tasks?.find((t) => t.id === taskId) ?? program.tasks?.[0] : undefined;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(1);
  const [date, setDate] = useState(maxDate);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date && date >= minDate && date <= maxDate;
  const [memo, setMemo] = useState("");
  const [mode, setMode] = useState<"observation" | "offline">("offline");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const storageKey = `bulk-recognition:v1:${schoolId}:${staff.uid}`;
  const [pending, setPending] = useState<Pending | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Pending | null; }
    catch { return null; }
  });
  const list = program ? (rows ?? []).filter((s) => s.year === school.year && program.grades.includes(s.grade) && canTeachClassProgram(staff, s.grade, s.classNo, program.id)) : [];
  const selected = list.filter((s) => picked.has(s.id));
  const unit = task ? task.kind === "sentences" ? "문장" : "회" : program?.unit ?? "회";
  useEffect(() => { setPicked(new Set()); setCount(1); }, [scope.grade, scope.classNo, program?.id, task?.id]);

  async function save() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    let job = pending;
    try {
      if (!job) {
        if (!program || !selected.length || (program.kind === "tasks" && !task) || !validDate || !Number.isInteger(count) || count < 1 || count > 100) return;
        const label = `${program.name}${task ? ` · ${task.name}` : ""}`;
        if (!(await askConfirm({ title: "일괄 인정 확인", message: `${label}\n${selected.length}명에게 각각 ${count}${unit}을 추가해요.\n활동일: ${date}\n이미 온라인으로 인정된 활동을 중복 입력하지 않았는지 확인해 주세요.`, ok: "인정하기", icon: "eye" }))) return;
        const requests: BulkRequest[] = [];
        for (let i = 0; i < selected.length; i += 200) requests.push({
          schoolId, program: program.id, ...(task ? { task: task.id } : {}),
          studentIds: selected.slice(i, i + 200).map((s) => s.id), count,
          activityDate: date, memo: memo.trim(), recognitionMode: mode, requestId: crypto.randomUUID(),
        });
        job = { requests, completed: 0, label };
        // 먼저 보관해 응답 유실·새로고침에도 같은 요청 번호로 재시도한다.
        sessionStorage.setItem(storageKey, JSON.stringify(job));
        setPending(job);
      }
      job = { ...job, failure: undefined };
      sessionStorage.setItem(storageKey, JSON.stringify(job));
      setPending(job);
      const call = httpsCallable<BulkRequest, { count: number; existing: boolean }>(functions, "bulkRecognize");
      for (let i = job.completed; i < job.requests.length; i++) {
        await call(job.requests[i]);
        job = { ...job, completed: i + 1 };
        sessionStorage.setItem(storageKey, JSON.stringify(job));
        setPending(job);
      }
      const total = job.requests.reduce((n, r) => n + r.studentIds.length, 0);
      sessionStorage.removeItem(storageKey);
      setPending(null);
      setPicked(new Set());
      toast(`${total}명의 활동을 인정했어요. 진행률에 곧 반영돼요.`);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (job && recoverableRejections.has(code)) {
        job = { ...job, failure: (e as Error).message };
        setPending(job);
        try { sessionStorage.setItem(storageKey, JSON.stringify(job)); } catch { /* 메모리에서 복구 안내 유지 */ }
      }
      toast("완료하지 못했어요. 같은 요청을 재시도하면 중복 인정되지 않아요: " + (e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function stopRejectedJob() {
    if (saving.current || !pending?.failure) return;
    const completedStudents = pending.requests.slice(0, pending.completed).reduce((n, request) => n + request.studentIds.length, 0);
    if (!(await askConfirm({
      title: "중단하고 입력 다시 하기",
      message: `완료가 확인된 ${completedStudents}명의 기록은 유지돼요.\n앞선 통신 오류로 완료 여부를 확인하지 못한 기록도 있을 수 있어요. [기록]에서 해당 학생·항목·날짜를 확인한 뒤 누락된 학생만 다시 선택해 주세요.\n기존 요청 번호는 이 탭에 보관하며, 입력 화면의 학생 선택을 모두 해제해요.`,
      ok: "확인 후 다시 입력", icon: "alert",
    }))) return;
    try {
      sessionStorage.setItem(`${storageKey}:stopped:${pending.requests[0].requestId}`, JSON.stringify(pending));
      sessionStorage.removeItem(storageKey);
      setPending(null);
      setPicked(new Set());
      toast("진행하던 요청을 중단했어요. 기록을 확인한 뒤 누락된 학생만 선택해 주세요.");
    } catch (e) {
      toast("요청 보관에 실패했어요. 기존 요청은 유지돼요: " + (e as Error).message);
    }
  }

  if (!isAdmin && !staff.bulkRecognitionPrograms?.length) return <div className="page"><Empty icon="lock">관리자가 일괄 체크 권한을 부여한 교사만 사용할 수 있어요.</Empty></div>;
  return (
    <div className="page">
      <PageHeader icon="eye" title="관찰·오프라인 일괄 체크" />
      {pending && <div className="card stack" style={{ marginBottom: 12 }} role="status">
        <b>{pending.label} · 일괄 인정 {pending.completed}/{pending.requests.length}묶음 완료</b>
        <span className="small">처리 결과를 확인할 때까지 같은 요청을 이어서 진행해요. 이미 반영된 학생에게 중복으로 추가하지 않아요.</span>
        {pending.failure && <div className="small" role="alert">요청이 거절됐어요: {pending.failure}<br />담당 범위·날짜·항목을 확인하세요. 수정이 필요하면 아래에서 중단한 뒤 다시 입력할 수 있어요.</div>}
        <div className="row"><button className="btn" disabled={busy} onClick={save}>{busy ? "인정 중…" : "이어서 완료하기"}</button>
          {pending.failure && <button className="btn ghost" disabled={busy} onClick={stopRejectedJob}>중단하고 다시 입력</button>}
        </div>
      </div>}
      <fieldset disabled={busy || Boolean(pending)} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <ScopeBar showProgram={false} />
        <p className="small muted">선생님이 직접 확인한 활동을 선택한 학생에게 추가해요. 온라인 도입 전에 검사한 기록도 입력할 수 있어요. 담당 범위와 허용된 인증 항목만 표시돼요.</p>
        {!program ? <Empty>이 학년에 허용된 일괄 체크 항목이 없어요. 관리자에게 권한과 담당 범위를 확인해 주세요.</Empty> : <div className="card px-card stack">
          <label className="field"><span>인증 항목</span><select className="input" value={program.id} onChange={(e) => { setProgramId(e.target.value); setTaskId(""); }}>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          {program.kind === "tasks" && <label className="field"><span>세부 과제</span><select className="input" value={task?.id ?? ""} onChange={(e) => setTaskId(e.target.value)}>{(program.tasks ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} · 목표 {t.goal}{t.kind === "sentences" ? "문장" : "회"}</option>)}</select></label>}
          {task && <p className="small muted">{task.description}{task.kind === "sentences" && <><br />오프라인 검사한 문장 수는 이 과제의 진행도에 합산돼요. 온라인의 개별 문장을 검사 완료로 바꾸지는 않아요.</>}</p>}
          <div className="row">
            <label className="field"><span>기록 구분</span><select className="input sm" value={mode} onChange={(e) => setMode(e.target.value as "observation" | "offline")}><option value="offline">오프라인 활동 인정</option><option value="observation">교사 관찰 기록</option></select></label>
            <label className="field"><span>활동일</span><input className="input sm" type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="field"><span>학생마다 추가할 {task?.kind === "sentences" ? "문장 수" : "횟수"} ({unit})</span><input className="input sm" type="number" min={1} max={100} step={1} value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ width: 100 }} /></label>
          </div>
          {!validDate && <div className="small" role="alert">활동일은 {minDate}~{maxDate} 사이의 실제 날짜로 입력해 주세요.</div>}
          <label className="field"><span>확인 내용 (선택)</span><input className="input sm" maxLength={300} placeholder="예: 3~9월 독서기록장 20편 확인" value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
          {error && <div className="chip red">학생을 불러오지 못했어요: {error}</div>}
          {rows === null ? <div className="muted">불러오는 중…</div> : list.length === 0 ? <Empty>담당 범위에 대상 학생이 없어요.</Empty> : <>
            <label className="row small"><input type="checkbox" checked={selected.length === list.length} onChange={(e) => setPicked(e.target.checked ? new Set(list.map((s) => s.id)) : new Set())} />모두 선택 ({selected.length}/{list.length})</label>
            <div className="grid grid-4" style={{ gap: 8 }}>{list.map((s) => <label key={s.id} className={`choice ${picked.has(s.id) ? "on" : ""}`} style={{ justifyContent: "space-between", borderRadius: 12 }}>
              <span><input type="checkbox" checked={picked.has(s.id)} onChange={(e) => setPicked((prev) => { const next = new Set(prev); if (e.target.checked) next.add(s.id); else next.delete(s.id); return next; })} style={{ marginRight: 6 }} />{s.classNo}-{s.number} {s.name}</span>
              <span className="tiny hud">{task ? `${s.progress?.[program.id]?.tasks?.[task.id] ?? 0}/${task.goal}` : countOf(s, program.id)}{unit}</span>
            </label>)}</div>
            <div className="submit-bar"><button className="btn big ok" disabled={!selected.length || !validDate || !Number.isInteger(count) || count < 1 || count > 100 || (program.kind === "tasks" && !task)} onClick={save}><PixelIcon name="check" size={20} /> {selected.length}명 × {count}{unit} 추가 인정</button></div>
          </>}
        </div>}
      </fieldset>
    </div>
  );
}
