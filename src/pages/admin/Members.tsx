import { useRef, useState } from "react";
import { doc, updateDoc, where, orderBy, writeBatch, serverTimestamp, arrayUnion, arrayRemove } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../firebase";
import { useCollection } from "../../lib/data";
import { sp, useSchoolId } from "../../lib/tenant";
import { useSchool } from "../../lib/school";
import type { StaffDoc, StudentDoc } from "../../lib/types";
import { PageHeader } from "../../components/Layout";
import { Empty, toast } from "../../components/ui";
import { parseRosterCsv, ROSTER_TEMPLATE, type RosterRow } from "../../../shared/roster";
import { classesOf, GRADES } from "../../lib/classes";
import { useConfig } from "../../lib/config";
import { activePrograms, programById } from "../../../shared/domain";
import { PixelIcon } from "../../components/Pixel";
import { askConfirm, askText, notice, Modal } from "../../components/Modal";
import { useSession } from "../../lib/auth";
import { RoleBox, SubjectClassPicker } from "../TeacherSignup";
import { deleteStudentFlow } from "../../lib/students";
import "./RosterGuide.css";

function download(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type AssignmentDuty = "all" | "homeroom" | "subject";

export function matchesStaffAssignmentFilter(staff: StaffDoc, duty: AssignmentDuty, grade: number | "all") {
  const homeroomMatches = Boolean(staff.homeroom && (grade === "all" || staff.grade === grade));
  const subjectMatches = Boolean(staff.subject && (grade === "all" || (staff.grades?.includes(grade) && (!staff.subjectClasses?.length || staff.subjectClasses.some((item) => item.grade === grade && item.classNo > 0)))));
  if (duty === "homeroom") return homeroomMatches;
  if (duty === "subject") return subjectMatches;
  return grade === "all" || homeroomMatches || subjectMatches;
}

export function Members() {
  const [tab, setTab] = useState<"admins" | "teachers" | "roster" | "students">("teachers");
  return (
    <div className="page members-page">
      <PageHeader icon="users" title="구성원 관리" />
      <div className="row members-tabs">
        <button className={`choice ${tab === "admins" ? "on" : ""}`} onClick={() => setTab("admins")}><PixelIcon name="gear" size={16} /> 관리자</button>
        <button className={`choice ${tab === "teachers" ? "on" : ""}`} onClick={() => setTab("teachers")}><PixelIcon name="users" size={16} /> 교사</button>
        <button className={`choice ${tab === "students" ? "on" : ""}`} onClick={() => setTab("students")}><PixelIcon name="school" size={16} /> 학급별 학생</button>
        {/* 보기 탭은 왼쪽, 명단 올리기는 오른쪽 끝 */}
        <button className={`choice members-upload-tab ${tab === "roster" ? "on" : ""}`} onClick={() => setTab("roster")}><PixelIcon name="upload" size={16} /> 학생 명단 CSV 올리기</button>
      </div>
      {(tab === "admins" || tab === "teachers") && <StaffManager key={`${tab}`} role={tab === "admins" ? "admin" : "teacher"} />}
      {tab === "roster" && <RosterUpload />}
      {tab === "students" && <ClassRoster />}
    </div>
  );
}

export function StaffManager({ role }: { role: StaffDoc["role"] }) {
  const schoolId = useSchoolId();
  const { rows } = useCollection<StaffDoc & { id: string }>(sp(schoolId, "staff"), [], [schoolId]);
  const allStaff = (rows ?? []).slice().sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || (a.grade ?? 9) - (b.grade ?? 9) || (a.classNo ?? 0) - (b.classNo ?? 0));
  const [dutyFilter, setDutyFilter] = useState<AssignmentDuty>("all");
  const [gradeFilter, setGradeFilter] = useState<number | "all">("all");
  const list = role === "admin" ? allStaff.filter((s) => s.role === "admin") : allStaff.filter((s) => matchesStaffAssignmentFilter(s, dutyFilter, gradeFilter));
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<(StaffDoc & { id: string }) | null>(null);
  const [grantTargetIds, setGrantTargetIds] = useState<string[] | null>(null);
  const eligible = list.filter((s) => s.status === "active" && s.role === "teacher");
  const selectedStaff = eligible.filter((s) => selected.includes(s.id));
  const grantTargets = grantTargetIds === null ? [] : eligible.filter((s) => grantTargetIds.includes(s.id));
  const pending = list.filter((s) => s.status === "pending");
  const config = useConfig();
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);
  const enabledPrograms = config.programs.filter((p) => p.enabled);
  const chosenPrograms = selectedPrograms.filter((id) => enabledPrograms.some((p) => p.id === id));
  const assignment = (s: StaffDoc) => {
    const grades = [...new Set(s.grades ?? [])].sort((a, b) => a - b);
    const restricted = Boolean(s.subjectClasses?.length);
    const classes = (s.subjectClasses ?? []).filter((c) => grades.includes(c.grade) && c.classNo > 0).sort((a, b) => a.grade - b.grade || a.classNo - b.classNo);
    const assignedGrades = restricted ? grades.filter((grade) => classes.some((c) => c.grade === grade)) : grades;
    const subjectLabel = assignedGrades.length ? `${assignedGrades.join("·")}학년${restricted ? ` (${classes.map((c) => `${c.grade}-${c.classNo}`).join("·")}반)` : " 전체"}` : "담당 학년 미지정";
    const firstLine = [s.homeroom && `담임 ${s.grade}학년 ${s.classNo}반`, s.subject && `전담 ${subjectLabel}`].filter(Boolean).join(" · ");
    const ids = [...new Set([...(s.homeroom && s.grade ? activePrograms(config, s.grade).map((p) => p.id) : []), ...(s.subject ? s.programs ?? [] : [])])];
    const leads = s.certificationPrograms ?? [];
    return <div className="member-assignment">
      <div>{firstLine || (leads.length ? "인증 업무 담당" : "담당 미지정")}</div>
      {ids.length > 0 && <div className="member-programs">{ids.map((id) => {
        const program = programById(config, id);
        return <span key={id} className="member-program"><PixelIcon name={program?.icon ?? "gamepad"} size={16} />{program?.name ?? id}</span>;
      })}</div>}
      {leads.length > 0 && <div className="member-programs"><span className="small muted">인증 업무</span>{leads.map((id) => {
        const program = programById(config, id);
        return <span key={id} className="member-program"><PixelIcon name={program?.icon ?? "gamepad"} size={16} />{program?.name ?? id}</span>;
      })}</div>}
    </div>;
  };
  async function set(id: string, patch: Record<string, unknown>) {
    const [action, value] = Object.entries(patch)[0];
    await httpsCallable(functions, "manageStaff")({ schoolId, staffId: id, action, value });
  }
  // 관리자는 최소 1명: 마지막 관리자는 해제·삭제 불가
  const me = useSession();
  const myUid = me.kind === "staff" ? me.user.uid : "";
  const admins = allStaff.filter((s) => s.status === "active" && s.role === "admin");
  const isLastAdmin = (s: StaffDoc & { id: string }) => s.role === "admin" && s.status === "active" && admins.length <= 1;
  const LAST_ADMIN = "관리자는 최소 1명 있어야 해요.\n먼저 다른 선생님을 관리자로 지정한 뒤 해제하세요.";
  async function toggleAdmin(s: StaffDoc & { id: string }) {
    if (s.role !== "admin") {
      if (await askConfirm({ title: "관리자 지정", message: `${s.name} 선생님을 관리자로 지정할까요?\n인증 항목·구성원·설정을 관리할 수 있게 돼요.`, ok: "지정", icon: "gear" })) await set(s.id, { role: "admin" });
      return;
    }
    if (isLastAdmin(s)) return void notice("관리자를 해제할 수 없어요", LAST_ADMIN);
    const self = s.id === myUid;
    if (await askConfirm({ title: "관리자 해제", message: self ? "내 관리자 역할을 해제할까요?\n해제하면 인증 항목·구성원·설정 메뉴가 사라져요." : `${s.name} 선생님의 관리자 역할을 해제할까요?`, ok: "해제", danger: true })) await set(s.id, { role: "teacher" });
  }
  async function remove(s: StaffDoc & { id: string }) {
    if (isLastAdmin(s)) return void notice("삭제할 수 없어요", "마지막 관리자예요.\n먼저 다른 선생님을 관리자로 지정한 뒤 삭제하세요.");
    if (await askConfirm({ title: "선생님 삭제", message: `${s.name} 선생님을 삭제할까요?\n다시 쓰려면 선생님이 새로 가입해야 해요.`, ok: "삭제", danger: true })) await httpsCallable(functions, "manageStaff")({ schoolId, staffId: s.id, action: "delete" });
  }
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    catch (e) { toast("변경하지 못했어요: " + (e as Error).message); }
    finally { setBusy(false); }
  }
  async function permission(targets: (StaffDoc & { id: string })[], enabled: boolean, programIds = chosenPrograms) {
    const teachers = targets.filter((s) => s.role === "teacher" && s.status === "active");
    if (!teachers.length || !programIds.length || busy) return;
    await run(async () => {
      if (!(await askConfirm({ title: `일괄 인정 권한 ${enabled ? "부여" : "회수"}`, message: `${teachers.length}명의 선생님에게 ${programIds.map((id) => programById(config, id)?.name ?? id).join(", ")} 일괄 인정 권한을 ${enabled ? "부여" : "회수"}할까요?\n권한이 있는 교사는 맡은 학생의 이전 활동과 관찰 기록을 횟수로 추가할 수 있어요.`, ok: enabled ? "부여" : "회수" }))) return;
      let completed = 0;
      try {
        for (let i = 0; i < teachers.length; i += 400) {
          const chunk = teachers.slice(i, i + 400);
          const batch = writeBatch(db);
          for (const teacher of chunk) batch.update(doc(db, sp(schoolId, `staff/${teacher.id}`)), { bulkRecognitionPrograms: enabled ? arrayUnion(...programIds) : arrayRemove(...programIds), updatedAt: serverTimestamp() });
          await batch.commit();
          completed += chunk.length;
          setSelected((ids) => ids.filter((id) => !chunk.some((s) => s.id === id)));
        }
        toast(`${completed}명에게 일괄 인정 권한을 ${enabled ? "부여" : "회수"}했어요.`);
        setGrantTargetIds(null);
        setSelectedPrograms([]);
      } catch (e) {
        throw new Error(`${completed}명 처리 완료. 나머지 인원은 다시 시도해 주세요. ${(e as Error).message}`);
      }
    });
  }
  function openGrant(ids: string[]) {
    setSelectedPrograms([]);
    setGrantTargetIds(ids);
  }
  return (
    <div className="stack">
      {role === "teacher" && <div className="card flat stack">
        <div className="row member-filter-controls">
          <label className="field member-filter-field"><span>담당 유형</span><select className="input sm" value={dutyFilter} disabled={busy} onChange={(e) => { setDutyFilter(e.target.value as AssignmentDuty); setSelected([]); }}>
            <option value="all">전체</option><option value="homeroom">담임</option><option value="subject">전담</option>
          </select></label>
          <label className="field member-filter-field"><span>담당 학년</span><select className="input sm" value={gradeFilter} disabled={busy} onChange={(e) => { setGradeFilter(e.target.value === "all" ? "all" : Number(e.target.value)); setSelected([]); }}>
            <option value="all">전체 학년</option>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}
          </select></label>
          <span className="small muted member-filter-result">표시 {list.length}명 / 전체 {allStaff.length}명</span>
        </div>
        <p className="small" style={{ margin: 0 }}>담임·전담·인증 업무 담당은 겸임할 수 있어요. 일괄 인정 권한은 별도로 부여하며, 권한을 회수해도 이미 인정한 기록은 유지돼요.</p>
        <div className="row member-bulk-controls">
          <label className="row small"><input type="checkbox" aria-label="표시된 승인 교사 모두 선택" disabled={busy || !eligible.length} checked={eligible.length > 0 && selectedStaff.length === eligible.length} onChange={(e) => setSelected(e.target.checked ? eligible.map((s) => s.id) : [])} /> 표시된 승인 교사 모두 선택 ({selectedStaff.length}/{eligible.length})</label>
          <button className="btn sm" disabled={busy || !selectedStaff.length} onClick={() => openGrant(selectedStaff.map((s) => s.id))}>선택 {selectedStaff.length}명 권한 변경</button>
        </div>
      </div>}
      {role === "admin" && <p className="small muted" style={{ margin: 0 }}>관리자는 학교 전체 현황과 구성원·인증 항목·설정을 관리할 수 있어요. 교사 업무는 교사 탭에서 확인해요.</p>}
      {pending.length > 0 && <div className="chip warn" style={{ alignSelf: "flex-start" }}>승인 대기 {pending.length}명</div>}
      {rows === null && <div className="muted">불러오는 중…</div>}
      {rows !== null && list.length === 0 && <Empty>{role === "teacher" && allStaff.length > 0 ? "선택한 조건에 맞는 교사가 없어요." : `등록된 ${role === "admin" ? "관리자" : "교사"}가 없어요.`}</Empty>}
      <div className="table-wrap members-table-wrap">
        <table className={`table members-table members-table--${role}`}>
          <thead><tr>{role === "teacher" && <th>선택</th>}<th>이름</th>{role === "teacher" && <th>담당</th>}<th>이메일</th><th>상태</th><th>{role === "teacher" ? "일괄 인정 권한" : "권한"}</th><th>관리</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                {role === "teacher" && <td className="member-select">{s.role === "teacher" && <input type="checkbox" aria-label={`${s.name} 선생님 선택`} disabled={busy || s.status !== "active"} checked={selectedStaff.some((item) => item.id === s.id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, s.id] : ids.filter((id) => id !== s.id))} />}</td>}
                <td className="member-name"><div className="member-name-line"><b>{s.name}</b>{role === "teacher" && s.role === "admin" && <span className="chip gray">관리자</span>}{s.requestedAdmin && s.role !== "admin" && <span className="chip warn">관리자 신청</span>}</div></td>
                {role === "teacher" && <td className="member-assignment-cell" data-label="담당">{assignment(s)}</td>}
                <td className="small member-email" data-label="이메일">{s.email}</td>
                <td className="member-status" data-label="상태">{s.status === "active" ? <span className="chip ok">승인</span> : s.status === "pending" ? <span className="chip warn">대기</span> : <span className="chip red">반려</span>}</td>
                <td className="member-permission-cell" data-label={role === "teacher" ? "일괄 인정 권한" : "권한"}>{role === "admin" ? <span className="chip">관리자</span> : s.role === "admin" ? <span className="small muted">전체 항목 허용</span> : <div className="member-permissions">{enabledPrograms.filter((p) => s.bulkRecognitionPrograms?.includes(p.id)).map((p) => <span className="chip gray icon-text" key={p.id}><PixelIcon name={p.icon} size={14} />{p.name}</span>)}{!s.bulkRecognitionPrograms?.length && <span className="small muted">없음</span>}</div>}</td>
                <td className="member-actions">
                  <div className="member-action-buttons">
                    {role === "teacher" && <button className="btn ghost sm" disabled={busy} onClick={() => setEditing(s)}>담당 수정</button>}
                    {role === "teacher" && s.role === "teacher" && s.status === "active" && <button className="btn ghost sm" disabled={busy} onClick={() => openGrant([s.id])}>권한 변경</button>}
                    {s.status !== "active" && <button className="btn ok sm" disabled={busy} onClick={() => run(() => set(s.id, { status: "active" }))}>승인</button>}
                    {s.status === "pending" && <button className="btn ghost sm" disabled={busy} onClick={() => run(() => set(s.id, { status: "rejected" }))}>반려</button>}
                    {s.status === "active" && (role === "admin" || s.role === "teacher") && <button className="btn ghost sm" disabled={busy} onClick={() => run(() => toggleAdmin(s))}>{s.role === "admin" ? "관리자 해제" : "관리자 지정"}</button>}
                    {(role === "admin" || s.role !== "admin") && <button className="btn ghost sm" disabled={busy} onClick={() => run(() => remove(s))}>삭제</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <AssignmentEditor key={editing.id} staff={editing} schoolId={schoolId} onClose={() => setEditing(null)} />}
      {grantTargetIds !== null && <Modal title="일괄 인정 권한 변경" icon="eye" onClose={() => { if (!busy) setGrantTargetIds(null); }}>
        <div className="stack">
          <p className="small" style={{ margin: 0 }}>대상: {grantTargets.length === 1 ? `${grantTargets[0]?.name} 선생님` : `${grantTargets.length}명`}. 변경할 인증 항목을 고른 뒤 권한을 부여하거나 회수하세요.</p>
          <div className="stack" style={{ gap: 8 }}>{enabledPrograms.map((p) => <label key={p.id} className="row small"><input type="checkbox" disabled={busy} checked={chosenPrograms.includes(p.id)} onChange={(e) => setSelectedPrograms((ids) => e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))} /><PixelIcon name={p.icon} size={16} /> {p.name}<span className="muted">현재 {grantTargets.filter((s) => s.bulkRecognitionPrograms?.includes(p.id)).length}/{grantTargets.length}명 허용</span></label>)}</div>
          {!enabledPrograms.length && <span className="small muted">사용 중인 인증 항목이 없어요.</span>}
          <div className="modal-actions"><button className="btn" disabled={busy || !grantTargets.length || !chosenPrograms.length} onClick={() => permission(grantTargets, true)}>선택 항목 권한 부여</button><button className="btn ghost" disabled={busy || !grantTargets.length || !chosenPrograms.length} onClick={() => permission(grantTargets, false)}>선택 항목 권한 회수</button><button className="btn ghost" disabled={busy} onClick={() => setGrantTargetIds(null)}>취소</button></div>
        </div>
      </Modal>}
    </div>
  );
}

function AssignmentEditor({ staff, schoolId, onClose }: { staff: StaffDoc & { id: string }; schoolId: string; onClose: () => void }) {
  const config = useConfig();
  const [homeroom, setHomeroom] = useState(Boolean(staff.homeroom));
  const [grade, setGrade] = useState(staff.grade ?? 3);
  const [classNo, setClassNo] = useState(staff.classNo ?? 1);
  const [subject, setSubject] = useState(Boolean(staff.subject));
  const [grades, setGrades] = useState(staff.grades ?? []);
  const [programs, setPrograms] = useState(staff.programs ?? []);
  const [subjectClasses, setSubjectClasses] = useState(staff.subjectClasses ?? []);
  const [certificationPrograms, setCertificationPrograms] = useState(staff.certificationPrograms ?? []);
  const [busy, setBusy] = useState(false);
  const availablePrograms = config.programs.filter((p) => p.enabled || programs.includes(p.id) || certificationPrograms.includes(p.id));
  const toggle = <T,>(values: T[], value: T) => values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
  const valid = (!homeroom || (GRADES.includes(grade) && Number.isInteger(classNo) && classNo >= 1 && classNo <= 99))
    && (!subject || (grades.length > 0 && grades.every((g) => GRADES.includes(g)) && (programs.length > 0 || !config.programs.some((p) => p.enabled)) && programs.every((id) => config.programs.some((p) => p.id === id))));
  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, sp(schoolId, `staff/${staff.id}`)), {
        homeroom, grade: homeroom ? grade : null, classNo: homeroom ? classNo : null,
        subject, grades: subject ? [...new Set(grades)].sort((a, b) => a - b) : [], programs: subject ? [...new Set(programs)] : [],
        subjectClasses: subject ? subjectClasses.filter((c) => grades.includes(c.grade)).sort((a, b) => a.grade - b.grade || a.classNo - b.classNo) : [], updatedAt: serverTimestamp(),
        certificationPrograms: [...new Set(certificationPrograms)],
      });
      toast(`${staff.name} 선생님의 담당을 저장했어요.`);
      onClose();
    } catch (e) { toast("저장하지 못했어요: " + (e as Error).message); }
    finally { setBusy(false); }
  }
  return <Modal title={`${staff.name} 선생님 담당 수정`} icon="users" wide onClose={() => { if (!busy) onClose(); }}>
    <div className="stack">
      <fieldset disabled={busy} className="stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <RoleBox icon="users" title="담임" desc="우리 반 학생의 모든 인증 항목 담당" on={homeroom} onToggle={() => setHomeroom(!homeroom)}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <label className="field"><span>담당 학년</span><select className="input" value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setClassNo(1); }}>{GRADES.map((g) => <option key={g} value={g}>{g}학년</option>)}</select></label>
            <label className="field"><span>담당 반</span><input className="input" type="number" min={1} max={99} step={1} value={classNo} onChange={(e) => setClassNo(Number(e.target.value))} /></label>
          </div>
        </RoleBox>
        <RoleBox icon="flag" title="전담" desc="담당 학년 학생의 선택한 인증 항목 기록과 학급 현황 확인" on={subject} onToggle={() => setSubject(!subject)}>
          <div className="field"><span>담당 학년</span><div className="row" style={{ flexWrap: "wrap" }}>{GRADES.map((g) => <button key={g} type="button" aria-pressed={grades.includes(g)} className={`choice ${grades.includes(g) ? "on" : ""}`} onClick={() => { setGrades(toggle(grades, g)); setSubjectClasses((items) => items.filter((c) => c.grade !== g)); }}>{g}학년</button>)}</div></div>
          <SubjectClassPicker grades={grades} value={subjectClasses} onChange={setSubjectClasses} />
          <div className="field"><span>담당 인증 항목</span><div className="row" style={{ flexWrap: "wrap" }}>{availablePrograms.map((p) => <button key={p.id} aria-pressed={programs.includes(p.id)} className={`choice ${programs.includes(p.id) ? "on" : ""}`} onClick={() => setPrograms(toggle(programs, p.id))}><PixelIcon name={p.icon} size={16} /> {p.name}{!p.enabled && " (중지)"}</button>)}</div>{availablePrograms.length === 0 && <span className="small muted">학교 인증 항목을 만든 뒤 담당 항목을 지정해 주세요.</span>}</div>
        </RoleBox>
        <RoleBox icon="trophy" title="인증 업무 담당" desc="선택한 인증 항목의 전교·학년·학급별 현황 조회 전용" on={certificationPrograms.length > 0} onToggle={() => setCertificationPrograms(certificationPrograms.length ? [] : availablePrograms[0] ? [availablePrograms[0].id] : [])}>
          <div className="field"><span>현황을 볼 인증 항목</span><div className="row" style={{ flexWrap: "wrap" }}>{availablePrograms.map((p) => <button key={p.id} type="button" aria-pressed={certificationPrograms.includes(p.id)} className={`choice ${certificationPrograms.includes(p.id) ? "on" : ""}`} onClick={() => setCertificationPrograms(toggle(certificationPrograms, p.id))}><PixelIcon name={p.icon} size={16} /> {p.name}{!p.enabled && " (중지)"}</button>)}</div>{availablePrograms.length === 0 && <span className="small muted">학교 인증 항목을 만든 뒤 지정해 주세요.</span>}</div>
        </RoleBox>
      </fieldset>
      {!valid && <p className="small" role="status" style={{ margin: 0 }}>담임의 학년·반 또는 전담의 학년·인증 항목을 확인해 주세요.</p>}
      <div className="modal-actions"><button className="btn" disabled={busy || !valid} onClick={save}>{busy ? "저장 중…" : "담당 저장"}</button><button className="btn ghost" disabled={busy} onClick={onClose}>취소</button></div>
    </div>
  </Modal>;
}

function RosterUpload() {
  const schoolId = useSchoolId();
  const school = useSchool();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [deactivate, setDeactivate] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onFile(f: File | undefined) {
    if (!f) return;
    const buf = await f.arrayBuffer();
    // 엑셀에서 저장한 CSV(EUC-KR)도 읽을 수 있게
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("euc-kr").decode(buf);
    const r = parseRosterCsv(text, school.studentDomain || undefined);
    setRows(r.rows);
    setErrors(r.errors);
  }

  async function upload() {
    if (!rows?.length) return;
    setBusy(true);
    try {
      const res = await httpsCallable<unknown, { created: number; updated: number; deactivated: number; year: number }>(functions, "importRoster")({ schoolId, rows, deactivateMissing: deactivate });
      toast(`${res.data.year}학년도 명단: 새로 ${res.data.created}명, 갱신 ${res.data.updated}명${res.data.deactivated ? `, 비활성 ${res.data.deactivated}명` : ""}`);
      setRows(null);
      setErrors([]);
    } catch (e) {
      toast("올리지 못했어요: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const byGrade = GRADES.map((g) => [g, rows?.filter((r) => r.grade === g).length ?? 0] as const).filter(([, n]) => n);
  return (
    <div className="stack">
      <div className="card stack">
        <b>학생 명단 올리기 ({school.year}학년도)</b>
        <div className="roster-guide-paths">
          <section className="roster-guide-path" aria-labelledby="roster-student-path">
            <div className="roster-guide-heading"><PixelIcon name="school" size={28} /><div><span className="roster-guide-tag">구글 워크스페이스 계정 · 기기 있음</span><h3 id="roster-student-path">학생이 직접 참여해요</h3></div></div>
            <ol className="roster-guide-flow">
              <li><span>1</span><div><b>명단 등록</b><small>학교 구글 계정 이메일 입력</small></div></li>
              <li><span>2</span><div><b>학생 로그인</b><small>학교 계정으로 접속</small></div></li>
              <li><span>3</span><div><b>활동 기록 올리기</b><small>교사 확인 후 횟수 반영</small></div></li>
            </ol>
          </section>
          <section className="roster-guide-path roster-guide-path-offline" aria-labelledby="roster-teacher-path">
            <div className="roster-guide-heading"><PixelIcon name="eye" size={28} /><div><span className="roster-guide-tag">계정 또는 태블릿 PC 없음</span><h3 id="roster-teacher-path">교사가 대신 기록해요</h3></div></div>
            <ol className="roster-guide-flow">
              <li><span>1</span><div><b>명단 등록</b><small>계정이 없으면 이메일은 빈칸</small></div></li>
              <li><span>2</span><div><b>오프라인 활동 확인</b><small>독서기록장 · 수업 활동 등</small></div></li>
              <li><span>3</span><div><b>교사의 일괄 체크</b><small>권한을 받은 교사가 횟수 추가</small></div></li>
            </ol>
          </section>
        </div>
        <div className="roster-guide-note">
          <PixelIcon name="users" size={24} />
          <div><b>이름·이메일은 선택 입력이에요</b><p>학년·반을 입력하고, 이름과 이메일을 모두 비울 때는 번호를 꼭 입력해 주세요. 이름은 학생이 첫 로그인 때 입력하거나, 교사가 <strong>현황 → 이름 일괄 입력</strong>에서 나중에 채울 수 있어요.</p></div>
        </div>
        <p className="roster-guide-save small muted"><b>양식 내려받기 → 명단 작성 → CSV(쉼표로 구분)로 저장 → 파일 올리기</b><br />이미 등록된 학생은 명단 정보가 갱신돼요.</p>
        <div className="row">
          <button className="btn secondary" onClick={() => download("학생명단_양식.csv", ROSTER_TEMPLATE)}><PixelIcon name="download" size={16} /> 양식 내려받기</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><PixelIcon name="upload" size={16} /> CSV 파일 고르기</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv,.txt" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
      {errors.length > 0 && (
        <div className="card flat" style={{ background: "var(--red-50)" }}>
          <b className="small">확인이 필요한 줄 {errors.length}개 (이 줄들은 빼고 올라가요)</b>
          <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>{errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="card stack">
          <div className="row between">
            <b>미리보기: {rows.length}명</b>
            <span className="small muted">{byGrade.map(([g, n]) => `${g}학년 ${n}명`).join(" · ")} · 계정 없음 {rows.filter((r) => !r.email).length}명</span>
          </div>
          <div className="table-wrap" style={{ maxHeight: 320 }}>
            <table className="table">
              <thead><tr><th>학년</th><th>반</th><th>번호</th><th>이름</th><th>이메일</th></tr></thead>
              <tbody>{rows.slice(0, 200).map((r, i) => <tr key={i}><td>{r.grade}</td><td>{r.classNo}</td><td className="num">{r.number}</td><td>{r.name || <span className="muted">(나중에 입력)</span>}</td><td className="small">{r.email || <span className="muted">(계정 없음)</span>}</td></tr>)}</tbody>
            </table>
          </div>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={deactivate} onChange={(e) => setDeactivate(e.target.checked)} /> 이 파일에 없는 기존 학생은 비활성(전학 등)으로 바꾸기</label>
          <div className="submit-bar"><button className="btn big ok" disabled={busy} onClick={upload}>{busy ? "올리는 중…" : `${rows.length}명 명단 등록`}</button></div>
        </div>
      )}
    </div>
  );
}

function ClassRoster() {
  const schoolId = useSchoolId();
  const [grade, setGrade] = useState(3);
  const [classNo, setClassNo] = useState(1);
  const { rows } = useCollection<StudentDoc & { id: string }>(sp(schoolId, "students"), [where("grade", "==", grade), where("classNo", "==", classNo), orderBy("number")], [schoolId, grade, classNo]);
  async function patch(id: string, data: Record<string, unknown>) {
    await updateDoc(doc(db, sp(schoolId, `students/${id}`)), data);
  }
  return (
    <div className="stack">
      <div className="scope-bar">
        <select className="input sm" value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setClassNo(1); }}>{GRADES.map((g) => <option key={g} value={g}>{g}학년</option>)}</select>
        <select className="input sm" value={classNo} onChange={(e) => setClassNo(Number(e.target.value))}>{classesOf(grade).map((c) => <option key={c} value={c}>{c}반</option>)}</select>
        <span className="small muted">{rows?.length ?? 0}명</span>
      </div>
      <div className="table-wrap">
        <table className="table stack-sm">
          <thead><tr><th>번호</th><th>이름</th><th>이메일</th><th>접속</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {(rows ?? []).map((s) => (
              <tr key={s.id} style={s.active === false ? { opacity: 0.5 } : undefined}>
                <td className="num">{s.number}</td>
                <td><b>{s.name || <span className="muted">(이름 입력 전)</span>}</b> {s.isDemo && <span className="chip demo">예시</span>}</td>
                <td className="small" data-label="이메일">{s.email || "(계정 없음)"}</td>
                <td data-label="접속">{s.hasAccount ? <PixelIcon name="check" size={16} /> : "-"}</td>
                <td data-label="상태">{s.active === false ? "비활성" : "활성"}</td>
                <td>
                  <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <button className="btn ghost sm" onClick={async () => { const n = await askText({ title: "학생 이름 고치기", label: `${s.grade}학년 ${s.classNo}반 ${s.number}번`, initial: s.name, placeholder: "예: 홍길동", maxLength: 20 }); if (n && n !== s.name) patch(s.id, { name: n }); }}>이름</button>
                    <button className="btn ghost sm" onClick={() => patch(s.id, { active: s.active === false })}>{s.active === false ? "활성화" : "비활성"}</button>
                    <button className="btn ghost sm danger-text" onClick={() => deleteStudentFlow(schoolId, s)}>삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows?.length === 0 && <Empty>이 반에 등록된 학생이 없어요.</Empty>}
    </div>
  );
}
