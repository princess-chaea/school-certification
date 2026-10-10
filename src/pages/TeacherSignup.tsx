import { useState } from "react";
import type { User } from "firebase/auth";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { logout } from "../lib/auth";
import { CLASSES_PER_GRADE } from "../lib/school";
import type { ProgramId, StaffDoc } from "../lib/types";
import { useConfig } from "../lib/config";

/** 교사 가입: 담임(○학년 ○반) 또는 전담·업무 담당(학년 + 분야) → 관리자 승인 대기 */
export function TeacherSignup({ user, existing }: { user: User; existing?: StaffDoc }) {
  const config = useConfig();
  const [name, setName] = useState(existing?.name ?? user.displayName ?? "");
  const [type, setType] = useState<"homeroom" | "subject">(existing?.teacherType ?? "homeroom");
  const [grade, setGrade] = useState(existing?.grade ?? 3);
  const [classNo, setClassNo] = useState(existing?.classNo ?? 1);
  const [grades, setGrades] = useState<number[]>(existing?.grades ?? [4, 5, 6]);
  const [programs, setPrograms] = useState<ProgramId[]>(existing?.programs ?? ["english"]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const valid = name.trim() && (type === "homeroom" || (grades.length && programs.length));

  async function submit() {
    setBusy(true);
    setErr(null);
    const data = {
      name: name.trim(),
      teacherType: type,
      ...(type === "homeroom" ? { grade, classNo, grades: [grade], programs: ["reading", "carbon", "english"] } : { grades: [...grades].sort(), programs, grade: null, classNo: null }),
      updatedAt: serverTimestamp(),
    };
    try {
      if (existing) await updateDoc(doc(db, "users", user.uid), data);
      else
        await setDoc(doc(db, "users", user.uid), {
          ...data,
          role: "teacher",
          status: "pending",
          email: user.email,
          createdAt: serverTimestamp(),
        });
    } catch (e) {
      setErr("저장하지 못했어요: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <div className="row between" style={{ marginTop: 16 }}>
        <div className="row">
          <img src="/logo.png" alt="" width={44} />
          <h1 style={{ margin: 0 }}>선생님 가입</h1>
        </div>
        <button className="btn ghost sm" onClick={() => logout()}>로그아웃</button>
      </div>
      <p className="muted small">{user.email} · 가입 후 업무 담당자(관리자)가 승인하면 사용할 수 있어요.</p>
      <div className="card stack">
        <label className="field">
          <span>이름</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
        </label>
        <div className="field">
          <span style={{ fontWeight: 600 }}>담당 업무</span>
          <div className="row">
            <button className={`choice ${type === "homeroom" ? "on" : ""}`} onClick={() => setType("homeroom")}>담임</button>
            <button className={`choice ${type === "subject" ? "on" : ""}`} onClick={() => setType("subject")}>전담·인증 업무 담당</button>
          </div>
        </div>
        {type === "homeroom" ? (
          <div className="row">
            <select className="input" style={{ width: 120 }} value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setClassNo(1); }}>
              {[1, 2, 3, 4, 5, 6].map((g) => <option key={g} value={g}>{g}학년</option>)}
            </select>
            <select className="input" style={{ width: 120 }} value={classNo} onChange={(e) => setClassNo(Number(e.target.value))}>
              {Array.from({ length: CLASSES_PER_GRADE[grade] }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{c}반</option>)}
            </select>
            <span className="muted">담임</span>
          </div>
        ) : (
          <>
            <div className="field">
              <span style={{ fontWeight: 600 }}>담당 학년 (해당 학년 기록이 보여요)</span>
              <div className="row">
                {[1, 2, 3, 4, 5, 6].map((g) => (
                  <button key={g} className={`choice ${grades.includes(g) ? "on" : ""}`} onClick={() => setGrades(toggle(grades, g))}>{g}학년</button>
                ))}
              </div>
            </div>
            <div className="field">
              <span style={{ fontWeight: 600 }}>인증 담당 분야</span>
              <div className="row">
                {(["reading", "carbon", "english"] as ProgramId[]).map((p) => (
                  <button key={p} className={`choice ${programs.includes(p) ? "on" : ""}`} onClick={() => setPrograms(toggle(programs, p))}>
                    {config.programs[p].emoji} {config.programs[p].name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {err && <div className="chip red">{err}</div>}
        <button className="btn big" disabled={!valid || busy} onClick={submit}>
          {existing ? "가입 정보 수정" : "가입 신청"}
        </button>
      </div>
    </div>
  );
}

export function PendingApproval({ staff, user }: { staff: StaffDoc; user: User }) {
  const [edit, setEdit] = useState(false);
  if (edit) return <TeacherSignup user={user} existing={staff} />;
  const what = staff.teacherType === "homeroom" ? `${staff.grade}학년 ${staff.classNo}반 담임` : `${staff.grades?.join("·")}학년 ${staff.programs?.length ?? 0}개 분야 담당`;
  return (
    <div className="login">
      <div className="card stack" style={{ alignItems: "center" }}>
        <img src="/logo.png" alt="" />
        <h1 style={{ margin: 0 }}>{staff.status === "rejected" ? "가입이 반려되었어요" : "승인을 기다리고 있어요"}</h1>
        <div className="muted">{staff.name} 선생님 · {what}</div>
        <div className="small muted">업무 담당자가 승인하면 이 화면이 자동으로 바뀌어요.</div>
        <div className="row">
          <button className="btn secondary" onClick={() => setEdit(true)}>가입 정보 수정</button>
          <button className="btn ghost" onClick={() => logout()}>로그아웃</button>
        </div>
      </div>
    </div>
  );
}
