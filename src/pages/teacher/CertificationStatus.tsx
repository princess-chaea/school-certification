import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import { useSchoolId } from "../../lib/tenant";
import { useSchool } from "../../lib/school";
import { useConfig } from "../../lib/config";
import type { StaffDoc } from "../../lib/types";
import { activePrograms } from "../../../shared/domain";
import { PageHeader } from "../../components/Layout";

type Counts = { students: number; participants: number; certified: number; none: number; bronze: number; silver: number; gold: number };
type Status = { program: string; year: number; totals: Counts; classes: Array<Counts & { grade: number; classNo: number }> };
const emptyCounts: Counts = { students: 0, participants: 0, certified: 0, none: 0, bronze: 0, silver: 0, gold: 0 };

/** 인증 업무 담당에게는 학생 개인정보 없이 항목별 집계만 제공한다. */
export function CertificationStatus({ staff }: { staff: StaffDoc }) {
  const schoolId = useSchoolId();
  const school = useSchool();
  const config = useConfig();
  const programs = activePrograms(config).filter((p) => staff.role === "admin" || staff.certificationPrograms?.includes(p.id));
  const [selectedProgram, setProgram] = useState("");
  const program = programs.find((p) => p.id === selectedProgram)?.id ?? programs[0]?.id ?? "";
  const [grade, setGrade] = useState(0);
  const [classNo, setClassNo] = useState(0);
  const [result, setResult] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    setResult(null);
    setError("");
    if (program) {
      httpsCallable<{ schoolId: string; program: string; year: number }, Status>(functions, "certificationStatus")({ schoolId, program, year: school.year })
        .then(({ data }) => { if (current) setResult(data); })
        .catch(() => { if (current) setError("인증 현황을 불러오지 못했어요. 권한을 확인하거나 다시 시도해 주세요."); });
    }
    return () => { current = false; };
  }, [schoolId, program, school.year, refresh]);
  const data = result?.program === program && result.year === school.year ? result : null;
  const grades = [...new Set(data?.classes.map((c) => c.grade) ?? [])].sort((a, b) => a - b);
  const classes = [...new Set(data?.classes.filter((c) => c.grade === grade).map((c) => c.classNo) ?? [])].sort((a, b) => a - b);
  const rows = data?.classes.filter((c) => (!grade || c.grade === grade) && (!classNo || c.classNo === classNo)) ?? [];
  const totals = !grade && !classNo && data ? data.totals : rows.reduce<Counts>((sum, row) => ({ students: sum.students + row.students, participants: sum.participants + row.participants, certified: sum.certified + row.certified, none: sum.none + row.none, bronze: sum.bronze + row.bronze, silver: sum.silver + row.silver, gold: sum.gold + row.gold }), { ...emptyCounts });
  return <div className="page">
    <PageHeader icon="trophy" title="인증 항목별 현황" right={<span className="chip gray">{school.year}</span>} />
    <p className="muted small">담당 인증 항목의 전교·학급별 참여와 인증 현황을 확인해요. 학생 기록 확인은 담임·전담의 담당 범위에서 진행해요.</p>
    <p className="muted small">현재 학년도에 재학 중인 대상 학년 학생을 집계하며, 예시 학생은 제외해요.</p>
    {!program ? <div className="card">담당 중인 활성 인증 항목이 없어요.</div> : <>
      <div className="card row" style={{ flexWrap: "wrap", marginBottom: 14 }}>
        <label>인증 항목 <select className="input sm" value={program} onChange={(e) => { setProgram(e.target.value); setGrade(0); setClassNo(0); }}>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>학년 <select className="input sm" value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setClassNo(0); }}><option value={0}>전체 학년</option>{grades.map((g) => <option key={g} value={g}>{g}학년</option>)}</select></label>
        <label>학급 <select className="input sm" value={classNo} disabled={!grade} onChange={(e) => setClassNo(Number(e.target.value))}><option value={0}>전체 반</option>{classes.map((c) => <option key={c} value={c}>{c}반</option>)}</select></label>
        <button className="btn ghost sm" onClick={() => setRefresh((v) => v + 1)}>새로고침</button>
      </div>
      {error ? <div role="alert" className="card">{error}</div> : !data ? <p role="status">불러오는 중…</p> : <>
        <div className="grid grid-4">
          {([["대상 학생", totals.students], ["참여 학생", totals.participants], ["인증 학생", totals.certified], ["미인증 학생", totals.none]] as const).map(([label, value]) => <div className="tile" key={label}><div className="k">{label}</div><div className="v">{value}명</div></div>)}
        </div>
        <div className="section-title">학급별 인증 현황</div>
        <div className="table-wrap"><table className="table"><thead><tr><th>학급</th><th>대상</th><th>참여</th><th>인증</th><th>동장</th><th>은장</th><th>금장</th></tr></thead><tbody>
          {rows.map((c) => <tr key={`${c.grade}-${c.classNo}`}><td>{c.grade}학년 {c.classNo}반</td><td>{c.students}</td><td>{c.participants}</td><td>{c.certified}</td><td>{c.bronze}</td><td>{c.silver}</td><td>{c.gold}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={7}>대상 학급이 없어요.</td></tr>}
        </tbody></table></div>
      </>}
    </>}
  </div>;
}
