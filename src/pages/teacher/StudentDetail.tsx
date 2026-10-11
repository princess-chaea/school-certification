import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, onSnapshot, orderBy, where } from "firebase/firestore";
import { useCollection } from "../../lib/data";
import { sp, useSchoolId } from "../../lib/tenant";
import { useConfig } from "../../lib/config";
import type { EnglishItem, StudentDoc, Submission } from "../../lib/types";
import { EnglishGroupCard, englishGroups, recordTime } from "../../components/EnglishItemCard";
import { fmtDate } from "../../lib/format";
import { Lightbox, StorageAudio, StorageImage, toast } from "../../components/ui";
import { PageHeader } from "../../components/Layout";
import { ProgramCard } from "../../components/ProgramCard";
import { activePrograms, programById, thresholdsFor } from "../../../shared/domain";
import { PixelIcon } from "../../components/Pixel";
import { db } from "../../firebase";
import { useScope } from "./scope";
import { useSession } from "../../lib/auth";
import { doc as fsDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { askText } from "../../components/Modal";
import { deleteStudentFlow } from "../../lib/students";
import { useNavigate } from "react-router-dom";
import { useScopedStudents } from "./Overview";

export function StudentDetail() {
  const { sid = "" } = useParams();
  const nav = useNavigate();
  const schoolId = useSchoolId();
  const config = useConfig();
  const { scope, allowedPrograms, isAdmin } = useScope();
  const session = useSession();
  const { rows: students, error: studentError } = useScopedStudents();
  const [adminStudent, setAdminStudent] = useState<{ schoolId: string; sid: string; value: StudentDoc | null } | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(doc(db, sp(schoolId, `students/${sid}`)), (snapshot) => setAdminStudent({ schoolId, sid, value: snapshot.exists() ? snapshot.data() as StudentDoc : null }), () => setAdminStudent({ schoolId, sid, value: null }));
  }, [schoolId, sid, isAdmin]);
  const student = isAdmin ? adminStudent?.schoolId === schoolId && adminStudent.sid === sid ? adminStudent.value : null : students?.find((s) => s.id === sid) ?? null;
  const [zoom, setZoom] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null); // 선생님 한마디 (편집 중인 값)
  const [busy, setBusy] = useState(false);
  const cons = student ? [where("year", "==", student.year), where("grade", "==", student.grade), where("classNo", "==", student.classNo), ...(scope.program ? [where("program", "==", scope.program)] : []), where("sid", "==", sid), orderBy("createdAt", "desc")] : [];
  const { rows } = useCollection<Submission>(student ? sp(schoolId, "submissions") : null, cons, [schoolId, sid, student?.year, student?.grade, student?.classNo, scope.program]);
  // 영어 문장 녹음 (검사 요청·인정·다시 하기) — 같은 범위 조건, 정렬은 화면에서
  const itemCons = student ? [where("year", "==", student.year), where("grade", "==", student.grade), where("classNo", "==", student.classNo), ...(scope.program ? [where("program", "==", scope.program)] : []), where("sid", "==", sid)] : [];
  const { rows: items } = useCollection<EnglishItem>(student ? sp(schoolId, "englishItems") : null, itemCons, [schoolId, sid, student?.year, student?.grade, student?.classNo, scope.program]);
  const entries = [
    ...(rows ?? []).filter((r) => r.sid === sid && (!scope.program || r.program === scope.program)).map((r) => ({ at: recordTime(r.createdAt), sub: r, item: null })),
    ...englishGroups((items ?? []).filter((r) => r.sid === sid && (!scope.program || r.program === scope.program))).map((g) => ({ at: g.at, sub: null, item: g })),
  ].sort((a, b) => b.at - a.at);
  async function saveNote(text: string) {
    setBusy(true);
    try {
      const me = session.kind === "staff" ? session.staff : null;
      await updateDoc(fsDoc(db, sp(schoolId, `students/${sid}`)), text ? { feedback: text, feedbackByName: me?.name ?? "선생님", feedbackAt: serverTimestamp() } : { feedback: "", feedbackByName: "", feedbackAt: serverTimestamp() });
      toast(text ? "학생 홈에 선생님 한마디가 보여요." : "선생님 한마디를 지웠어요.");
      setNote(null);
    } catch (e) {
      toast("저장하지 못했어요: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!student) return <div className="page">{isAdmin ? adminStudent?.schoolId === schoolId && adminStudent.sid === sid ? "학생을 찾을 수 없어요." : "불러오는 중…" : students === null && !studentError ? "불러오는 중…" : "현재 담당 범위에서 학생을 찾을 수 없어요. 현황에서 학급을 선택해 주세요."}</div>;
  // 이름 고치기: 담임(우리 반)·관리자만 (학생은 첫 로그인 때 한 번만 입력)
  const me = session.kind === "staff" ? session.staff : null;
  const canRename = !!me && (me.role === "admin" || (me.homeroom === true && me.grade === student.grade && me.classNo === student.classNo));
  async function rename() {
    const n = await askText({ title: "학생 이름 고치기", label: `${student!.grade}학년 ${student!.classNo}반 ${student!.number}번`, initial: student!.name, placeholder: "예: 홍길동", maxLength: 20 });
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
      <PageHeader back="/" title={`${student.grade}-${student.classNo} ${student.number}번 ${student.name || "(이름 입력 전)"}`} right={<><span className="small muted">{student.email || "계정 없음"}</span>{canRename && <button className="btn ghost sm" onClick={rename}>이름 고치기</button>}{canRename && <button className="btn ghost sm danger-text" onClick={async () => { if (await deleteStudentFlow(schoolId, { ...student, sid })) nav("/"); }}>학생 삭제</button>}</>} />
      <div className="grid grid-3">
        {activePrograms(config, student.grade).filter((x) => !allowedPrograms || allowedPrograms.includes(x.id)).map((x) => <ProgramCard key={x.id} program={x} progress={p[x.id] ?? { count: 0, medal: "none", thresholds: thresholdsFor(config, x, student.grade)! }} />)}
      </div>
      <div className="section-title">선생님 한마디 (선택 · 학생 홈에 보여요)</div>
      <div className="card flat stack" style={{ background: "var(--navy-50)" }}>
        {note === null ? (
          <>
            {student.feedback ? <div style={{ whiteSpace: "pre-line" }}>“{student.feedback}” <span className="tiny">— {student.feedbackByName}</span></div> : <span className="small muted">아직 남긴 한마디가 없어요. 격려나 다음 도전을 짧게 적어 주세요.</span>}
            <div className="row" style={{ gap: 6 }}>
              <button className="btn secondary sm" onClick={() => setNote(student.feedback ?? "")}><PixelIcon name="speech" size={14} /> {student.feedback ? "고치기" : "한마디 남기기"}</button>
              {student.feedback && <button className="btn ghost sm" disabled={busy} onClick={() => saveNote("")}>지우기</button>}
            </div>
          </>
        ) : (
          <>
            <textarea className="input" autoFocus maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 꾸준히 기록하는 모습이 멋져요! 다음엔 은장에 도전해 볼까요?" style={{ minHeight: 90 }} />
            <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
              <span className="tiny" style={{ marginRight: "auto" }}>{note.length}/300</span>
              <button className="btn sm" disabled={busy || !note.trim()} onClick={() => saveNote(note.trim())}>{busy ? "저장 중…" : "저장"}</button>
              <button className="btn ghost sm" onClick={() => setNote(null)}>취소</button>
            </div>
          </>
        )}
      </div>
      <div className="section-title">기록 ({entries.length})</div>
      <div className="stack">
        {entries.map(({ sub: r, item }) => item ? <EnglishGroupCard key={item.key} group={item} config={config} /> : r && (
          <div key={r.id} className={`card flat sub-card ${r.status === "deleted" ? "deleted" : ""}`}>
            {r.photoPath ? <StorageImage path={r.photoPath} onOpen={setZoom} /> : <div className="thumb"><PixelIcon name={r.audioPath ? "mic" : programById(config, r.program)?.icon ?? "star"} size={32} /></div>}
            <div className="stack" style={{ gap: 3 }}>
              <div className="row between"><b className="small icon-text"><PixelIcon name={programById(config, r.program)?.icon ?? "star"} size={16} /> {programById(config, r.program)?.name ?? r.program} {r.task ? ` · ${programById(config, r.program)?.tasks?.find((t) => t.id === r.task)?.name ?? r.task}` : ""} {r.activityType ?? ""} {r.source === "teacher" ? `· ${r.recognitionMode === "offline" ? "오프라인 인정" : "교사 관찰"} ${r.count}${r.task ? (programById(config, r.program)?.tasks?.find((t) => t.id === r.task)?.kind === "sentences" ? "문장" : "회") : programById(config, r.program)?.unit ?? "회"}` : ""} {r.status === "pending" && <span className="chip warn">확인 대기</span>}</b><span className="tiny">{r.activityDate ?? fmtDate(r.createdAt)}</span></div>
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
