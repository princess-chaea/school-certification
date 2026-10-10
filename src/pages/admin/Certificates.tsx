import { useMemo, useState } from "react";
import { useCollection } from "../../lib/data";
import { sp, useSchoolId } from "../../lib/tenant";
import { useConfig } from "../../lib/config";
import { useSchool } from "../../lib/school";
import type { StudentDoc } from "../../lib/types";
import { PageHeader } from "../../components/Layout";
import { Empty, MedalBadge, toast } from "../../components/ui";
import { HwpxCertificate, issueDateParts } from "../../components/HwpxCertificate";
import { medalOf } from "../teacher/Overview";
import { isCertified, MEDAL_LABEL, type ProgramId } from "../../../shared/domain";
import { principalTitle } from "../../../shared/school";
import { GRADES } from "../../lib/classes";

const PROGRAMS: ProgramId[] = ["reading", "carbon", "english"];

function save(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 분야별 인증(동 이상) 학생 → 한글 인증서 일괄 출력 / 메일 머지 명단 / 웹 인쇄 */
export function Certificates() {
  const schoolId = useSchoolId();
  const school = useSchool();
  const config = useConfig();
  const { rows } = useCollection<StudentDoc & { id: string }>(sp(schoolId, "students"), [], [schoolId]);
  const [program, setProgram] = useState<ProgramId | "all">("all");
  const [grade, setGrade] = useState<number | 0>(0);
  const [includeDemo, setIncludeDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);

  const list = useMemo(() => {
    const out: Array<{ s: StudentDoc & { id: string }; p: ProgramId }> = [];
    for (const s of rows ?? []) {
      if (s.active === false || (!includeDemo && s.isDemo)) continue;
      if (grade && s.grade !== grade) continue;
      for (const p of PROGRAMS) if ((program === "all" || program === p) && isCertified(medalOf(s, p))) out.push({ s, p });
    }
    return out.sort((a, b) => PROGRAMS.indexOf(a.p) - PROGRAMS.indexOf(b.p) || a.s.grade - b.s.grade || a.s.classNo - b.s.classNo || a.s.number - b.s.number);
  }, [rows, program, grade, includeDemo]);

  async function hwpx() {
    setBusy(true);
    try {
      const [{ buildCertificatesHwpx }, template] = await Promise.all([import("../../../shared/hwpx"), fetch("/cert/template.hwpx").then((r) => r.arrayBuffer())]);
      let seal: Uint8Array | null | undefined = undefined;
      if (school.sealUrl && school.sealUrl !== "/cert/seal.jpg") {
        seal = await fetch(school.sealUrl).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)).catch(() => null);
        if (!seal) toast("직인 이미지를 불러오지 못해 직인 없이 만들어요.");
      } else if (!school.sealUrl) seal = null;
      const out = buildCertificatesHwpx(
        new Uint8Array(template),
        list.map(({ s, p }) => ({ field: config.programs[p].name, grade: s.grade, classNo: s.classNo, name: s.name })),
        { date: issueDateParts(config.certificate.issueDate), schoolName: school.name, principalTitle: principalTitle(school), year: school.year, seal },
      );
      save(`${school.shortName}_학교장인증서_${program === "all" ? "전체" : config.programs[program].name}_${list.length}명.hwpx`, out as BlobPart, "application/hwp+zip");
    } catch (e) {
      toast("만들지 못했어요: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function csv() {
    const [y, m, d] = issueDateParts(config.certificate.issueDate);
    const lines = ["학년,반,번호,이름,인증분야,단계,연,월,일", ...list.map(({ s, p }) => [s.grade, s.classNo, s.number, s.name, config.programs[p].name, MEDAL_LABEL[medalOf(s, p) ?? "none"], y, m, d].join(","))];
    save(`${school.shortName}_인증명단_메일머지.csv`, "﻿" + lines.join("\n"), "text/csv;charset=utf-8");
  }

  return (
    <div className="page">
      <PageHeader title="🏅 인증서 출력" right={<span className="chip ok">대상 {list.length}장</span>} />
      <div className="scope-bar">
        <button className={`choice ${program === "all" ? "on" : ""}`} onClick={() => setProgram("all")}>전 분야</button>
        {PROGRAMS.map((p) => <button key={p} className={`choice ${program === p ? "on" : ""}`} onClick={() => setProgram(p)}>{config.programs[p].emoji} {config.programs[p].name}</button>)}
        <select className="input sm" value={grade} onChange={(e) => setGrade(Number(e.target.value))}><option value={0}>전 학년</option>{GRADES.map((g) => <option key={g} value={g}>{g}학년</option>)}</select>
        <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} /> 예시 학생 포함</label>
      </div>
      <div className="card stack no-print">
        <div className="small muted">분야별로 <b>동(계획서 인증 기준) 이상</b>을 달성한 학생이에요. 수여 날짜·학교장·직인은 [설정]에서 바꿀 수 있어요. (현재 수여일: {config.certificate.issueDate})</div>
        <div className="row">
          <button className="btn" disabled={!list.length || busy} onClick={hwpx}>{busy ? "만드는 중…" : `📄 한글(hwpx) 인증서 ${list.length}장 한 파일로`}</button>
          <button className="btn secondary" disabled={!list.length} onClick={csv}>⬇️ 메일 머지용 명단(CSV)</button>
          <button className="btn ghost" disabled={!list.length} onClick={() => { setPrinting(true); setTimeout(() => window.print(), 400); }}>🖨️ 웹 인증서 인쇄</button>
        </div>
      </div>
      {rows === null ? <div className="muted">불러오는 중…</div> : list.length === 0 ? <Empty>아직 인증(동 이상)을 달성한 학생이 없어요.</Empty> : (
        <div className="table-wrap no-print" style={{ marginTop: 14 }}>
          <table className="table">
            <thead><tr><th>인증분야</th><th>학년</th><th>반</th><th>번호</th><th>이름</th><th>단계</th></tr></thead>
            <tbody>{list.map(({ s, p }) => <tr key={s.id + p}><td>{config.programs[p].emoji} {config.programs[p].name}</td><td>{s.grade}</td><td>{s.classNo}</td><td className="num">{s.number}</td><td><b>{s.name}</b> {s.isDemo && <span className="chip demo">예시</span>}</td><td><MedalBadge medal={medalOf(s, p) ?? "none"} /></td></tr>)}</tbody>
          </table>
        </div>
      )}
      {printing && (
        <div className="print-only">
          {list.map(({ s, p }) => <div key={s.id + p} className="print-page"><HwpxCertificate config={config} program={p} student={s} /></div>)}
          <button className="btn no-print" onClick={() => setPrinting(false)}>인쇄 미리보기 닫기</button>
        </div>
      )}
    </div>
  );
}
