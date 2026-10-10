import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useSchoolId, sp } from "../../lib/tenant";
import { useConfig } from "../../lib/config";
import { CLASSES_PER_GRADE } from "../../lib/classes";
import type { StaffDoc } from "../../lib/types";
import { PageHeader } from "../../components/Layout";
import { PixelIcon } from "../../components/Pixel";
import { toast } from "../../components/ui";
import { RoleBox } from "../TeacherSignup";

/** 내 역할: 담임 학급, 전담 학년·항목을 스스로 바꾸기 (학교 담당자 지정은 [구성원]에서) */
export function MyRoles({ staff }: { staff: StaffDoc }) {
  const schoolId = useSchoolId();
  const config = useConfig();
  const [name, setName] = useState(staff.name);
  const [homeroom, setHomeroom] = useState(Boolean(staff.homeroom));
  const [grade, setGrade] = useState(staff.grade ?? 3);
  const [classNo, setClassNo] = useState(staff.classNo ?? 1);
  const [subject, setSubject] = useState(Boolean(staff.subject));
  const [grades, setGrades] = useState<number[]>(staff.grades ?? []);
  const [programs, setPrograms] = useState<string[]>(staff.programs ?? []);
  const [busy, setBusy] = useState(false);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const isAdmin = staff.role === "admin";
  const valid = name.trim() && (isAdmin || homeroom || subject) && (!subject || (grades.length > 0 && programs.length > 0));

  async function save() {
    setBusy(true);
    try {
      await updateDoc(doc(db, sp(schoolId, `staff/${staff.uid}`)), {
        name: name.trim().slice(0, 30),
        homeroom,
        grade: homeroom ? grade : null,
        classNo: homeroom ? classNo : null,
        subject,
        grades: subject ? grades : [],
        programs: subject ? programs : [],
        updatedAt: serverTimestamp(),
      });
      toast("저장했어요.");
    } catch (e) {
      toast("저장하지 못했어요: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <PageHeader title="내 역할" icon="hand" />
      <div className="card stack">
        <label className="field">
          <span>이름</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className={`role-box ${isAdmin ? "on" : ""}`}>
          <div className="role-head" style={{ cursor: "default" }}>
            <PixelIcon name="gear" size={26} />
            <span style={{ flex: 1 }}>
              <b>학교 담당자</b> {isAdmin ? <span className="chip ok">지정됨</span> : <span className="chip gray">아님</span>}
              <br />
              <span className="tiny">학교 담당자 지정·해제는 다른 학교 담당자가 [구성원]에서 해요.</span>
            </span>
          </div>
        </div>
        <RoleBox icon="users" title="담임" desc="우리 반 학생의 모든 인증 기록 확인" on={homeroom} onToggle={() => setHomeroom(!homeroom)}>
          <div className="row">
            <select className="input" style={{ width: 120 }} value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setClassNo(1); }}>
              {[1, 2, 3, 4, 5, 6].map((g) => <option key={g} value={g}>{g}학년</option>)}
            </select>
            <select className="input" style={{ width: 120 }} value={classNo} onChange={(e) => setClassNo(Number(e.target.value))}>
              {Array.from({ length: Math.max(CLASSES_PER_GRADE[grade] ?? 6, 10) }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{c}반</option>)}
            </select>
          </div>
        </RoleBox>
        <RoleBox icon="check" title="전담 · 인증 업무 담당" desc="고른 학년의 고른 인증 항목 기록 확인" on={subject} onToggle={() => setSubject(!subject)}>
          <div className="field">
            <span className="small" style={{ fontWeight: 700 }}>담당 학년</span>
            <div className="row">
              {[1, 2, 3, 4, 5, 6].map((g) => <button key={g} className={`choice ${grades.includes(g) ? "on" : ""}`} onClick={() => setGrades(toggle(grades, g))}>{g}학년</button>)}
            </div>
          </div>
          <div className="field">
            <span className="small" style={{ fontWeight: 700 }}>담당 인증 항목</span>
            <div className="row">
              {config.programs.filter((p) => p.enabled).map((p) => (
                <button key={p.id} className={`choice ${programs.includes(p.id) ? "on" : ""}`} onClick={() => setPrograms(toggle(programs, p.id))}>
                  <PixelIcon name={p.icon} size={18} /> {p.name}
                </button>
              ))}
            </div>
          </div>
        </RoleBox>
        <button className="btn big" disabled={!valid || busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
      </div>
    </div>
  );
}
