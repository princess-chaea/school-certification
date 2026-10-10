import { useRef, useState } from "react";
import { deleteDoc, doc, updateDoc, where, orderBy } from "firebase/firestore";
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
import { programById } from "../../../shared/domain";
import { PixelIcon } from "../../components/Pixel";
import { askConfirm, askText, notice } from "../../components/Modal";
import { useSession } from "../../lib/auth";
import { deleteStudentFlow } from "../../lib/students";

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

export function Members() {
  const [tab, setTab] = useState<"staff" | "roster" | "students">("staff");
  return (
    <div className="page">
      <PageHeader icon="users" title="구성원 관리" />
      <div className="row" style={{ marginBottom: 14 }}>
        <button className={`choice ${tab === "staff" ? "on" : ""}`} onClick={() => setTab("staff")}><PixelIcon name="users" size={16} /> 교사·담당자</button>
        <button className={`choice ${tab === "students" ? "on" : ""}`} onClick={() => setTab("students")}><PixelIcon name="school" size={16} /> 학급별 학생</button>
        {/* 보기 탭은 왼쪽, 명단 올리기는 오른쪽 끝 */}
        <button className={`choice ${tab === "roster" ? "on" : ""}`} style={{ marginLeft: "auto" }} onClick={() => setTab("roster")}><PixelIcon name="upload" size={16} /> 학생 명단 CSV 올리기</button>
      </div>
      {tab === "staff" && <StaffManager />}
      {tab === "roster" && <RosterUpload />}
      {tab === "students" && <ClassRoster />}
    </div>
  );
}

function StaffManager() {
  const schoolId = useSchoolId();
  const { rows } = useCollection<StaffDoc & { id: string }>(sp(schoolId, "staff"), [], [schoolId]);
  const list = (rows ?? []).sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || (a.grade ?? 9) - (b.grade ?? 9) || (a.classNo ?? 0) - (b.classNo ?? 0));
  const pending = list.filter((s) => s.status === "pending");
  const config = useConfig();
  const label = (s: StaffDoc) => [s.homeroom && `${s.grade}학년 ${s.classNo}반 담임`, s.subject && `전담 ${s.grades?.join("·")}학년 (${(s.programs ?? []).map((p) => programById(config, p)?.name ?? p).join(", ")})`].filter(Boolean).join(" · ") || "-";
  async function set(id: string, patch: Record<string, unknown>) {
    await updateDoc(doc(db, sp(schoolId, `staff/${id}`)), patch);
  }
  // 학교 담당자는 최소 1명: 마지막 담당자는 해제·삭제 불가
  const me = useSession();
  const myUid = me.kind === "staff" ? me.user.uid : "";
  const admins = list.filter((s) => s.status === "active" && s.role === "admin");
  const isLastAdmin = (s: StaffDoc & { id: string }) => s.role === "admin" && s.status === "active" && admins.length <= 1;
  const LAST_ADMIN = "학교 담당자는 최소 1명 있어야 해요.\n먼저 다른 선생님을 [담당자 지정]한 뒤 해제하세요.";
  async function toggleAdmin(s: StaffDoc & { id: string }) {
    if (s.role !== "admin") {
      if (await askConfirm({ title: "학교 담당자 지정", message: `${s.name} 선생님을 학교 담당자로 지정할까요?\n인증 항목·구성원·설정을 관리할 수 있게 돼요.`, ok: "지정", icon: "gear" })) await set(s.id, { role: "admin" });
      return;
    }
    if (isLastAdmin(s)) return void notice("담당자를 해제할 수 없어요", LAST_ADMIN);
    const self = s.id === myUid;
    if (await askConfirm({ title: "학교 담당자 해제", message: self ? "내 학교 담당자 역할을 해제할까요?\n해제하면 인증 항목·구성원·설정 메뉴가 사라져요." : `${s.name} 선생님의 학교 담당자 역할을 해제할까요?`, ok: "해제", danger: true })) await set(s.id, { role: "teacher" });
  }
  async function remove(s: StaffDoc & { id: string }) {
    if (isLastAdmin(s)) return void notice("삭제할 수 없어요", "마지막 학교 담당자예요.\n먼저 다른 선생님을 [담당자 지정]한 뒤 삭제하세요.");
    if (await askConfirm({ title: "선생님 삭제", message: `${s.name} 선생님을 삭제할까요?\n다시 쓰려면 선생님이 새로 가입해야 해요.`, ok: "삭제", danger: true })) await deleteDoc(doc(db, sp(schoolId, `staff/${s.id}`)));
  }
  return (
    <div className="stack">
      {pending.length > 0 && <div className="chip warn" style={{ alignSelf: "flex-start" }}>승인 대기 {pending.length}명</div>}
      {rows === null && <div className="muted">불러오는 중…</div>}
      {rows?.length === 0 && <Empty>가입한 교사가 없어요.</Empty>}
      <div className="table-wrap">
        <table className="table stack-sm">
          <thead><tr><th>이름</th><th>담당</th><th>이메일</th><th>상태</th><th>권한</th><th></th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td><b>{s.name}</b></td>
                <td data-label="담당">{label(s)}</td>
                <td className="small" data-label="이메일">{s.email}</td>
                <td>{s.status === "active" ? <span className="chip ok">승인</span> : s.status === "pending" ? <span className="chip warn">대기</span> : <span className="chip red">반려</span>}</td>
                <td>{s.role === "admin" ? <span className="chip">학교 담당자</span> : "교사"}{s.requestedAdmin && s.role !== "admin" ? <span className="chip warn">담당자 신청</span> : null}</td>
                <td>
                  <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    {s.status !== "active" && <button className="btn ok sm" onClick={() => set(s.id, { status: "active" })}>승인</button>}
                    {s.status === "pending" && <button className="btn ghost sm" onClick={() => set(s.id, { status: "rejected" })}>반려</button>}
                    {s.status === "active" && <button className="btn ghost sm" onClick={() => toggleAdmin(s)}>{s.role === "admin" ? "담당자 해제" : "담당자 지정"}</button>}
                    <button className="btn ghost sm" onClick={() => remove(s)}>삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
        <ol className="small muted" style={{ lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
          <li>양식을 내려받아 <b>학년, 반, 번호(선택), 이름(선택), 이메일</b>을 채워요. 이름을 비우면 학생이 첫 로그인 때 직접 입력하고, 그 뒤에는 담임 선생님만 고칠 수 있어요. 학교 구글 계정 관리 화면에서 받은 전체 목록을 붙여 넣으면 편해요.</li>
          <li>태블릿·계정이 없는 학생(1~2학년 등)은 이메일을 비워 두면 돼요. 담임이 관찰 기록으로 체크해요.</li>
          <li>CSV(쉼표로 구분)로 저장해서 올려요. 이미 있는 학생은 학년·반·이름이 갱신돼요.</li>
        </ol>
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
              <tbody>{rows.slice(0, 200).map((r, i) => <tr key={i}><td>{r.grade}</td><td>{r.classNo}</td><td className="num">{r.number}</td><td>{r.name || <span className="muted">(첫 로그인 때 입력)</span>}</td><td className="small">{r.email || <span className="muted">(계정 없음)</span>}</td></tr>)}</tbody>
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
