import { useEffect, useState } from "react";
import { collection, doc, getCountFromServer, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useCollection } from "../../lib/data";
import { sp, useSchoolId } from "../../lib/tenant";
import { useConfig } from "../../lib/config";
import { useSchool } from "../../lib/school";
import type { StudentDoc } from "../../lib/types";
import { PageHeader } from "../../components/Layout";
import { MedalDistribution, countOf, medalOf } from "../teacher/Overview";
import { isCertified, activePrograms } from "../../../shared/domain";
import { PixelIcon } from "../../components/Pixel";
import { GRADES } from "../../lib/classes";


/** 관리자: 전교 현황 + 공모 보고서 서식1 수치(참여율·인증률) */
export function AdminHome() {
  const schoolId = useSchoolId();
  const school = useSchool();
  const config = useConfig();
  const { rows } = useCollection<StudentDoc & { id: string }>(sp(schoolId, "students"), [], [schoolId]);
  const students = (rows ?? []).filter((s) => s.active !== false);
  const real = students.filter((s) => !s.isDemo);
  const [types, setTypes] = useState<Array<[string, number]>>([]);
  const [usage, setUsage] = useState<{ total?: number } | null>(null);

  const PROGRAMS = activePrograms(config);
  const choiceProgram = PROGRAMS.find((p) => p.choices?.length);
  useEffect(() => {
    const list = choiceProgram?.choices ?? [];
    Promise.all(
      list.map(async (t) => {
        const q = query(collection(db, sp(schoolId, "submissions")), where("year", "==", school.year), where("program", "==", choiceProgram!.id), where("status", "==", "active"), where("activityType", "==", t));
        const c = await getCountFromServer(q).catch(() => null);
        return [t, c?.data().count ?? 0] as [string, number];
      }),
    ).then((r) => setTypes(r.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])));
  }, [schoolId, school.year, choiceProgram?.id, choiceProgram?.choices]);
  useEffect(() => {
    const d = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    return onSnapshot(doc(db, sp(schoolId, `aiUsage/${d}`)), (s) => setUsage(s.exists() ? (s.data() as { total?: number }) : { total: 0 }), () => setUsage(null));
  }, [schoolId]);

  const base = students;
  const participants = base.filter((s) => PROGRAMS.some((p) => countOf(s, p.id) > 0));
  const certified = participants.filter((s) => PROGRAMS.some((p) => isCertified(medalOf(s, p.id))));
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const maxType = Math.max(1, ...types.map(([, n]) => n));

  return (
    <div className="page">
      <PageHeader icon="school" title={`${school.name} 전교 현황`} right={<span className="chip gray hud">{school.year}</span>} />
      {students.length > real.length && <div className="chip demo" style={{ marginBottom: 10 }}>예시(더미) 학생 {students.length - real.length}명이 포함된 수치예요. 보고서에는 실제 기록만 써 주세요.</div>}

      <div className="card stack" style={{ background: "var(--navy-50)" }}>
        <b className="icon-text"><PixelIcon name="file" size={20} /> 우수학교 공모 보고서 [서식1] 수치</b>
        <div className="grid grid-4">
          <div className="tile"><div className="k">대상 학생 수</div><div className="v">{base.length}명</div><div className="s">인증제 대상 학년 명단 기준</div></div>
          <div className="tile"><div className="k">참여 학생 수</div><div className="v">{participants.length}명</div><div className="s">기록 1건 이상</div></div>
          <div className="tile"><div className="k">참여율</div><div className="v">{pct(participants.length, base.length)}%</div><div className="s">참여 ÷ 대상 × 100</div></div>
          <div className="tile"><div className="k">인증율</div><div className="v">{pct(certified.length, participants.length)}%</div><div className="s">인증 {certified.length}명 ÷ 참여 × 100</div></div>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginTop: 14 }}>
        {PROGRAMS.map((p) => <MedalDistribution key={p.id} students={students} program={p} />)}
      </div>

      <div className="section-title">학년별 인증 현황</div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>학년</th><th>학생</th><th>참여</th>
              {PROGRAMS.map((p) => <th key={p.id}><span className="icon-text"><PixelIcon name={p.icon} size={16} />인증</span></th>)}
              <th>참여율</th><th>인증율</th>
            </tr>
          </thead>
          <tbody>
            {GRADES.map((g) => {
              const gs = students.filter((s) => s.grade === g);
              const gp = gs.filter((s) => PROGRAMS.some((p) => countOf(s, p.id) > 0));
              const gc = gp.filter((s) => PROGRAMS.some((p) => isCertified(medalOf(s, p.id))));
              return (
                <tr key={g}>
                  <td>{g}학년</td>
                  <td className="num">{gs.length}</td>
                  <td className="num">{gp.length}</td>
                  {PROGRAMS.map((p) => <td key={p.id} className="num">{p.grades.includes(g) ? gs.filter((s) => isCertified(medalOf(s, p.id))).length : "-"}</td>)}
                  <td className="num">{pct(gp.length, gs.length)}%</td>
                  <td className="num">{pct(gc.length, gp.length)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-3" style={{ marginTop: 14 }}>
        <div className="card stack" style={{ gridColumn: "span 2" }}>
          <b className="icon-text"><PixelIcon name={choiceProgram?.icon ?? "chart"} size={20} /> {choiceProgram?.name ?? "활동"} 종류 (전교 누적)</b>
          {types.length === 0 ? <span className="small muted">아직 기록이 없어요.</span> : types.map(([t, n]) => (
            <div key={t} className="row small" style={{ gap: 8 }}>
              <span style={{ width: 120, flex: "none" }}>{t}</span>
              <div className="progress-bar" style={{ flex: 1, height: 14 }}><div style={{ width: `${(n / maxType) * 100}%`, background: "var(--carbon)" }} title={`${t} ${n}회`} /></div>
              <span className="num" style={{ width: 56, textAlign: "right" }}>{n}회</span>
            </div>
          ))}
        </div>
        <div className="tile">
          <div className="k icon-text"><PixelIcon name="robot" size={18} /> 오늘 AI 사용</div>
          <div className="v">{usage?.total ?? 0}회</div>
          <div className="s">하루 상한 {config.ai.dailyLimit}회 · 사진 {config.ai.photoModel} · 교사 {config.ai.teacherModel}</div>
        </div>
      </div>
    </div>
  );
}
