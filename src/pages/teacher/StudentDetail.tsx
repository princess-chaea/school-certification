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
import { activePrograms, programById, thresholdsFor } from "../../../shared/domain";
import { PixelIcon } from "../../components/Pixel";
import { useEffect } from "react";
import { onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useScope } from "./scope";
import { useSession } from "../../lib/auth";
import { doc as fsDoc, serverTimestamp, updateDoc } from "firebase/firestore";

export function StudentDetail() {
  const { sid = "" } = useParams();
  const schoolId = useSchoolId();
  const config = useConfig();
  const { scope } = useScope();
  const session = useSession();
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
  // 이름 고치기: 담임(우리 반)·학교 담당자만 (학생은 첫 로그인 때 한 번만 입력)
  const me = session.kind === "staff" ? session.staff : null;
  const canRename = !!me && (me.role === "admin" || (me.homeroom === true && me.grade === student.grade && me.classNo === student.classNo));
  async function rename() {
    const n = prompt("학생 이름", student!.name)?.trim();
    if (!n || n === student!.name) return;
    try {
      await updateDoc(fsDoc(db, sp(schoolId, `students/${sid}`)), { name: n, updatedAt: serverTimestamp() });
      toast("이름을 고쳤어요.");
    } catch (e) {
      toast("고치지 못했어요: " + (e as Error).message);
    }
  }
  const p = student.progress ?? {};
  return (
    <div className="page">
      <Lightbox url={zoom} onClose={() => setZoom(null)} />
      <PageHeader back="/" title={`${student.grade}-${student.classNo} ${student.number}번 ${student.name || "(이름 입력 전)"}`} right={<><span className="small muted">{student.email || "계정 없음"}</span>{canRename && <button className="btn ghost sm" onClick={rename}>이름 고치기</button>}</>} />
      <div className="grid grid-3">
        {activePrograms(config, student.grade).map((x) => <ProgramCard key={x.id} program={x} progress={p[x.id] ?? { count: 0, medal: "none", thresholds: thresholdsFor(config, x, student.grade)! }} />)}
      </div>
      <div className="section-title">AI 초안 (선생님이 확인 후 사용)</div>
      <div className="row">
        <button className="btn secondary" disabled={busy} onClick={() => ai("feedback")}><PixelIcon name="speech" size={16} /> 격려 피드백 초안</button>
        <button className="btn secondary" disabled={busy} onClick={() => ai("record")}><PixelIcon name="pen" size={16} /> 누가기록 초안</button>
        {busy && <span className="small muted">작성 중…</span>}
      </div>
      {draft && (
        <div className="card flat stack" style={{ marginTop: 10, background: "var(--navy-50)" }}>
          <textarea className="input" value={draft} onChange={(e) => setDraft(e.target.value)} style={{ minHeight: 100 }} />
          <div><button className="btn sm" onClick={() => { navigator.clipboard?.writeText(draft); toast("복사했어요."); }}>복사</button></div>
        </div>
      )}
      <div className="section-title">기록 ({rows?.length ?? 0})</div>
      <div className="stack">
        {(rows ?? []).map((r) => (
          <div key={r.id} className={`card flat sub-card ${r.status === "deleted" ? "deleted" : ""}`}>
            {r.photoPath ? <StorageImage path={r.photoPath} onOpen={setZoom} /> : <div className="thumb"><PixelIcon name={r.audioPath ? "mic" : programById(config, r.program)?.icon ?? "star"} size={32} /></div>}
            <div className="stack" style={{ gap: 3 }}>
              <div className="row between"><b className="small icon-text"><PixelIcon name={programById(config, r.program)?.icon ?? "star"} size={16} /> {programById(config, r.program)?.name ?? r.program} {r.activityType ?? ""} {r.source === "teacher" ? `· 교사 관찰 ${r.count}회` : ""} {r.status === "pending" && <span className="chip warn">확인 대기</span>}</b><span className="tiny">{r.activityDate ?? fmtDate(r.createdAt)}</span></div>
              {Object.entries(r.fields ?? {}).filter(([, v]) => v).map(([k, v]) => <div key={k} className="small"><span className="muted">{k}:</span> {v}</div>)}
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
