import { useState } from "react";
import { useParams } from "react-router-dom";
import { doc, orderBy, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import { useCollection } from "../../lib/data";
import { sp, useSchoolId } from "../../lib/tenant";
import { useConfig } from "../../lib/config";
import type { StudentDoc, Submission } from "../../lib/types";
import { fmtDate } from "../../lib/format";
import { Lightbox, StorageAudio, StorageImage, toast } from "../../components/ui";
import { PageHeader } from "../../components/Layout";
import { ProgramCard } from "../../components/ProgramCard";
import { englishProgress } from "../../../shared/domain";
import { useEffect } from "react";
import { onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useScope } from "./scope";

export function StudentDetail() {
  const { sid = "" } = useParams();
  const schoolId = useSchoolId();
  const config = useConfig();
  const { scope } = useScope();
  const [student, setStudent] = useState<StudentDoc | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => onSnapshot(doc(db, sp(schoolId, `students/${sid}`)), (s) => setStudent(s.exists() ? (s.data() as StudentDoc) : null), () => setStudent(null)), [schoolId, sid]);
  const cons = student ? [where("year", "==", student.year), where("grade", "==", student.grade), where("classNo", "==", student.classNo), ...(scope.program ? [where("program", "==", scope.program)] : []), where("sid", "==", sid), orderBy("createdAt", "desc")] : [];
  const { rows } = useCollection<Submission>(student ? sp(schoolId, "submissions") : null, cons, [schoolId, sid, student?.year, scope.program]);

  async function ai(kind: "feedback" | "record") {
    setBusy(true);
    setDraft(null);
    try {
      const res = await httpsCallable<unknown, { text: string }>(functions, "draftComment")({ schoolId, sid, kind });
      setDraft(res.data.text);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!student) return <div className="page">불러오는 중…</div>;
  const p = student.progress ?? {};
  const eng = englishProgress(config, p.english?.counts ?? { t1: 0, t2: 0, t3: 0, t4: 0 });
  return (
    <div className="page">
      <Lightbox url={zoom} onClose={() => setZoom(null)} />
      <PageHeader back="/" title={`${student.grade}-${student.classNo} ${student.number}번 ${student.name}`} right={<span className="small muted">{student.email || "계정 없음"}</span>} />
      <div className="grid grid-3">
        <ProgramCard program={config.programs.reading} progress={p.reading} />
        <ProgramCard program={config.programs.carbon} progress={p.carbon} />
        {config.programs.english.grades.includes(student.grade) && (
          <div className="card">
            <h3>{config.programs.english.emoji} {config.programs.english.name}</h3>
            {eng.tasks.map((t) => <div key={t.id} className="small">{t.complete ? "✅" : "⬜"} {t.name} {t.done}/{t.goal}</div>)}
          </div>
        )}
      </div>
      <div className="section-title">🤖 AI 초안 (선생님이 확인 후 사용)</div>
      <div className="row">
        <button className="btn secondary" disabled={busy} onClick={() => ai("feedback")}>💬 격려 피드백 초안</button>
        <button className="btn secondary" disabled={busy} onClick={() => ai("record")}>📝 누가기록 초안</button>
        {busy && <span className="small muted">작성 중…</span>}
      </div>
      {draft && (
        <div className="card flat stack" style={{ marginTop: 10, background: "var(--navy-50)" }}>
          <textarea className="input" value={draft} onChange={(e) => setDraft(e.target.value)} style={{ minHeight: 100 }} />
          <div><button className="btn sm" onClick={() => { navigator.clipboard?.writeText(draft); toast("복사했어요."); }}>📋 복사</button></div>
        </div>
      )}
      <div className="section-title">기록 ({rows?.length ?? 0})</div>
      <div className="stack">
        {(rows ?? []).map((r) => (
          <div key={r.id} className={`card flat sub-card ${r.status === "deleted" ? "deleted" : ""}`}>
            {r.photoPath ? <StorageImage path={r.photoPath} onOpen={setZoom} /> : <div className="thumb">{r.audioPath ? "🎙️" : config.programs[r.program].emoji}</div>}
            <div className="stack" style={{ gap: 3 }}>
              <div className="row between"><b className="small">{config.programs[r.program].emoji} {r.bookTitle || r.activityType || (r.task === "t4" ? "펀리딩 낭독" : r.task === "t2" ? "알공" : r.source === "teacher" ? `교사 관찰 ${r.count}회` : "기록")}</b><span className="tiny">{r.activityDate ?? fmtDate(r.createdAt)}</span></div>
              {r.text && <div className="small muted">“{r.text}”</div>}
              {r.audioPath && <StorageAudio path={r.audioPath} />}
              {r.status === "deleted" && <span className="chip red">제외됨: {r.deleteReason}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
