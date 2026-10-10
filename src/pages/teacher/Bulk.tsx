import { useState } from "react";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { sp, useSchoolId } from "../../lib/tenant";
import { useConfig } from "../../lib/config";
import { useSchool } from "../../lib/school";
import { Empty, toast } from "../../components/ui";
import { PageHeader } from "../../components/Layout";
import { ScopeBar, useScope } from "./scope";
import { useScopedStudents, countOf } from "./Overview";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 태블릿이 없는 학생(1~2학년 등)의 활동을 교사가 관찰해 일괄 체크 */
export function Bulk() {
  const schoolId = useSchoolId();
  const school = useSchool();
  const config = useConfig();
  const { scope, staff } = useScope();
  const { rows } = useScopedStudents();
  const program = scope.program === "carbon" ? "carbon" : "reading";
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(1);
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const list = (rows ?? []).filter((s) => config.programs[program].grades.includes(s.grade));

  async function save() {
    setBusy(true);
    try {
      const batch = writeBatch(db);
      for (const sid of picked) {
        const s = list.find((x) => x.id === sid);
        if (!s) continue;
        batch.set(doc(collection(db, sp(schoolId, "submissions"))), {
          sid, year: school.year, grade: s.grade, classNo: s.classNo, program,
          source: "teacher", status: "active", count, activityDate: date,
          ...(memo.trim() ? { text: memo.trim() } : {}),
          createdBy: staff.uid, createdByName: staff.name, createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
      toast(`${picked.size}명에게 ${count}${config.programs[program].unit} 기록했어요.`);
      setPicked(new Set());
    } catch (e) {
      toast("기록하지 못했어요: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader title="✅ 관찰 기록 일괄 체크" />
      <ScopeBar programs={["reading", "carbon"]} />
      <p className="small muted" style={{ marginTop: -4 }}>태블릿이 없는 학생(1~2학년 등)의 활동을 선생님이 확인하고 한 번에 기록해요. 학생 화면과 인증 진행률에 바로 반영돼요.</p>
      <div className="card stack">
        <div className="row">
          <b>{config.programs[program].emoji} {config.programs[program].name}</b>
          <label className="row small" style={{ gap: 6 }}>📅 <input className="input sm" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="row small" style={{ gap: 6 }}>횟수 <input className="input sm" type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} style={{ width: 80 }} />{config.programs[program].unit}</label>
          <input className="input sm" style={{ flex: 1, minWidth: 160 }} placeholder="메모 (선택, 예: 독서록 확인)" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
        {rows === null ? <div className="muted">불러오는 중…</div> : list.length === 0 ? <Empty>대상 학생이 없어요.</Empty> : (
          <>
            <label className="row small" style={{ gap: 6 }}>
              <input type="checkbox" checked={picked.size === list.length} onChange={(e) => setPicked(e.target.checked ? new Set(list.map((s) => s.id)) : new Set())} /> 모두 선택 ({picked.size}/{list.length})
            </label>
            <div className="grid grid-4" style={{ gap: 8 }}>
              {list.map((s) => (
                <label key={s.id} className={`choice ${picked.has(s.id) ? "on" : ""}`} style={{ justifyContent: "space-between", borderRadius: 12 }}>
                  <span><input type="checkbox" checked={picked.has(s.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} style={{ marginRight: 6 }} />{s.classNo}-{s.number} {s.name}</span>
                  <span className="tiny">{countOf(s, program)}{config.programs[program].unit}</span>
                </label>
              ))}
            </div>
            <div className="submit-bar">
              <button className="btn big ok" disabled={!picked.size || busy} onClick={save}>{picked.size}명 × {count}{config.programs[program].unit} 기록</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
