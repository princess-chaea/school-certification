import { useMemo, useState } from "react";
import { doc, limit, orderBy, serverTimestamp, where, writeBatch, type QueryConstraint } from "firebase/firestore";
import { db } from "../../firebase";
import { BUNDLED_SETS, useAiReviews, useCollection } from "../../lib/data";
import { sp, useSchoolId } from "../../lib/tenant";
import { useSchool } from "../../lib/school";
import { useConfig } from "../../lib/config";
import type { EnglishItem, Submission } from "../../lib/types";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { Empty, Lightbox, StorageAudio, StorageImage, StorageLink, toast } from "../../components/ui";
import { PageHeader } from "../../components/Layout";
import { PixelIcon } from "../../components/Pixel";
import { ScopeBar, useScope } from "./scope";
import { useScopedStudents } from "./Overview";
import { speak } from "../../lib/speech";
import { programById } from "../../../shared/domain";

/** 확인하기: 학생이 올린 기록 승인 + 문장 검사 (모든 학교 공통) */
export function Review() {
  const [tab, setTab] = useState<"evidence" | "sentences">("evidence");
  return (
    <div className="page">
      <PageHeader icon="check" title="확인하기" />
      <ScopeBar />
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`choice ${tab === "evidence" ? "on" : ""}`} onClick={() => setTab("evidence")}><PixelIcon name="camera" size={16} /> 올린 기록 승인</button>
        <button className={`choice ${tab === "sentences" ? "on" : ""}`} onClick={() => setTab("sentences")}><PixelIcon name="mic" size={16} /> 문장 검사</button>
      </div>
      {tab === "evidence" ? <EvidenceQueue /> : <SentenceQueue />}
    </div>
  );
}

function EvidenceQueue() {
  const schoolId = useSchoolId();
  const school = useSchool();
  const config = useConfig();
  const { scope, staff } = useScope();
  const { rows: students } = useScopedStudents();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const cons: QueryConstraint[] = [where("year", "==", school.year), where("grade", "==", scope.grade)];
  if (scope.classNo) cons.push(where("classNo", "==", scope.classNo));
  if (scope.program) cons.push(where("program", "==", scope.program));
  cons.push(where("status", "==", "pending"), orderBy("createdAt", "asc"), limit(100));
  const { rows, error } = useCollection<Submission>(sp(schoolId, "submissions"), cons, [schoolId, school.year, scope.grade, scope.classNo, scope.program]);
  const names = useMemo(() => new Map((students ?? []).map((s) => [s.id, `${s.classNo}-${s.number} ${s.name}`])), [students]);
  const list = rows ?? [];
  const [onlyFlag, setOnlyFlag] = useState(false);
  const ai = useAiReviews(list.map((r) => r.id));
  const flagged = (r: Submission) => Boolean((ai.get(r.id) && ai.get(r.id)!.verdict !== "ok") || (r.audioCheck && r.audioCheck.voicedRatio < 0.3));
  const aiOk = list.filter((r) => ai.get(r.id)?.verdict === "ok" && !flagged(r)).map((r) => r.id);
  const shown = onlyFlag ? list.filter(flagged) : list;

  async function decide(ids: string[], approve: boolean, why = "") {
    const batch = writeBatch(db);
    ids.forEach((id) =>
      batch.update(doc(db, sp(schoolId, `submissions/${id}`)), approve
        ? { status: "active", reviewedBy: staff.uid, reviewedByName: staff.name, reviewedAt: serverTimestamp() }
        : { status: "deleted", deletedBy: staff.name, deletedAt: serverTimestamp(), deleteReason: why || "다시 올려 주세요" }),
    );
    await batch.commit();
    setPicked(new Set());
    setRejecting(null);
    setReason("");
    toast(approve ? `${ids.length}건 승인! 학생 횟수가 올라가요.` : "반려했어요. 학생 기록에 사유가 보여요.");
  }

  return (
    <>
      <Lightbox url={zoom} onClose={() => setZoom(null)} />
      {error && <div className="chip red">불러오지 못했어요: {error}</div>}
      {list.length > 0 && (
        <div className="card px-card row" style={{ marginBottom: 10 }}>
          <span className="hud">WAIT {list.length}</span>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={picked.size === list.length} onChange={(e) => setPicked(e.target.checked ? new Set(list.map((i) => i.id)) : new Set())} /> 모두 선택
          </label>
          <button className="btn ok" disabled={!picked.size} onClick={() => decide([...picked], true)}>선택한 {picked.size}건 승인</button>
          <button className="btn secondary" disabled={!aiOk.length} onClick={() => decide(aiOk, true)}><PixelIcon name="robot" size={16} /> AI 확인됨 {aiOk.length}건 한 번에 승인</button>
          <button className={`choice ${onlyFlag ? "on" : ""}`} onClick={() => setOnlyFlag((v) => !v)}><PixelIcon name="alert" size={16} /> 경고만 보기 ({list.filter(flagged).length})</button>
        </div>
      )}
      <div className="stack">
        {rows === null && <div className="muted">불러오는 중…</div>}
        {rows && list.length === 0 && <Empty icon="check">승인을 기다리는 기록이 없어요.</Empty>}
        {shown.map((r) => {
          const def = programById(config, r.program);
          const task = def?.tasks?.find((t) => t.id === r.task);
          return (
            <div key={r.id} className={`card flat review-row ${flagged(r) ? "flagged" : ""}`}>
              <input type="checkbox" checked={picked.has(r.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} aria-label="선택" />
              {r.photoPath ? <StorageImage path={r.photoPath} onOpen={setZoom} /> : <div className="thumb"><PixelIcon name={r.audioPath ? "mic" : def?.icon ?? "star"} size={32} /></div>}
              <div className="stack" style={{ gap: 3, minWidth: 0 }}>
                <div className="row between"><b>{names.get(r.sid) ?? r.sid} {r.isDemo && <span className="chip demo">예시</span>}</b><span className="tiny">활동 {r.activityDate ? fmtDate(new Date(r.activityDate)) : "-"} · 올림 {fmtDateTime(r.createdAt)}</span></div>
                <div className="small icon-text"><PixelIcon name={def?.icon ?? "star"} size={16} /> {def?.name ?? r.program}{task ? ` · ${task.name}` : ""} {r.activityType && <span className="chip gray">{r.activityType}</span>}</div>
                {Object.entries(r.fields ?? {}).filter(([, v]) => v).map(([k, v]) => <div key={k} className="small"><span className="muted">{(task?.fields ?? def?.fields ?? []).find((f) => f.key === k)?.label ?? k}:</span> {v}</div>)}
                {r.text && <div className="small muted">“{r.text}”</div>}
                {r.link && <a className="small" href={r.link} target="_blank" rel="noreferrer">{r.link}</a>}
                <StorageLink path={r.filePath} name={r.fileName} />
                {r.audioPath && <StorageAudio path={r.audioPath} />}
                {r.durationSec ? <span className="tiny">녹음 {Math.floor(r.durationSec / 60)}분 {r.durationSec % 60}초{r.audioCheck ? ` · 소리 있는 구간 ${Math.round(r.audioCheck.voicedRatio * 100)}%` : ""}</span> : null}
                {r.audioCheck && r.audioCheck.voicedRatio < 0.3 && <span className="chip warn"><PixelIcon name="alert" size={12} /> 소리가 거의 없는 녹음이에요. 들어 보고 확인해 주세요</span>}
                {ai.get(r.id) && <AiChip review={ai.get(r.id)!} />}
                {rejecting === r.id && (
                  <div className="row">
                    <input className="input sm" style={{ flex: 1, minWidth: 160 }} placeholder="반려 사유 (예: 본인이 보이게 다시 찍어 주세요)" value={reason} onChange={(e) => setReason(e.target.value)} />
                    <button className="btn danger sm" onClick={() => decide([r.id], false, reason.trim())}>반려</button>
                  </div>
                )}
              </div>
              <div className="row actions">
                <button className="btn ok sm" onClick={() => decide([r.id], true)}>승인</button>
                <button className="btn ghost sm" onClick={() => setRejecting(rejecting === r.id ? null : r.id)}>반려</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SentenceQueue() {
  const schoolId = useSchoolId();
  const school = useSchool();
  const config = useConfig();
  const { scope, staff } = useScope();
  const { rows: students } = useScopedStudents();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const cons: QueryConstraint[] = [where("year", "==", school.year), where("grade", "==", scope.grade)];
  if (scope.classNo) cons.push(where("classNo", "==", scope.classNo));
  if (scope.program) cons.push(where("program", "==", scope.program));
  cons.push(where("status", "==", "requested"), orderBy("requestedAt", "asc"));
  const { rows, error } = useCollection<EnglishItem>(sp(schoolId, "englishItems"), cons, [schoolId, school.year, scope.grade, scope.classNo, scope.program]);
  const names = useMemo(() => new Map((students ?? []).map((s) => [s.id, `${s.classNo}-${s.number} ${s.name}`])), [students]);
  const list = rows ?? [];

  function sentence(i: EnglishItem) {
    if (i.custom?.en) return { en: i.custom.en, ko: i.custom.ko, custom: true };
    const s = BUNDLED_SETS[i.setId]?.items.find((x) => x.no === i.no);
    return { en: s?.en ?? "", ko: s?.ko ?? "", custom: false };
  }
  async function decide(ids: string[], status: "checked" | "retry", teacherNote = "") {
    const batch = writeBatch(db);
    ids.forEach((id) => batch.update(doc(db, sp(schoolId, `englishItems/${id}`)), { status, checkedBy: staff.uid, checkedByName: staff.name, checkedAt: serverTimestamp(), teacherNote, updatedAt: serverTimestamp() }));
    await batch.commit();
    setPicked(new Set());
    setNoteFor(null);
    setNote("");
    toast(status === "checked" ? `${ids.length}문장 통과! 학생 화면에 띵동` : "다시 해 보기로 돌려보냈어요.");
  }

  return (
    <>
      <p className="small muted" style={{ marginTop: -4 }}>학생이 선생님 앞에서 문장을 말하면 통과를 눌러 주세요. 나중에 몰아서 확인할 때는 녹음을 들을 수 있어요.</p>
      {error && <div className="chip red">불러오지 못했어요: {error}</div>}
      {list.length > 0 && (
        <div className="card px-card row" style={{ marginBottom: 10 }}>
          <span className="hud">WAIT {list.length}</span>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={picked.size === list.length} onChange={(e) => setPicked(e.target.checked ? new Set(list.map((i) => i.id)) : new Set())} /> 모두 선택
          </label>
          <button className="btn ok" disabled={!picked.size} onClick={() => decide([...picked], "checked")}>선택한 {picked.size}문장 통과</button>
        </div>
      )}
      <div className="stack">
        {rows === null && <div className="muted">불러오는 중…</div>}
        {rows && list.length === 0 && <Empty icon="check">검사를 기다리는 문장이 없어요.</Empty>}
        {list.map((i) => {
          const s = sentence(i);
          const def = programById(config, i.program);
          const last = [...(i.rounds ?? [])].reverse().find((r) => r.audioPath && r.audioPath !== "demo");
          return (
            <div key={i.id} className="card flat queue-row">
              <input type="checkbox" checked={picked.has(i.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} aria-label="선택" />
              <div className="stack" style={{ gap: 3, minWidth: 0 }}>
                <div className="small"><b>{names.get(i.sid) ?? i.sid}</b> · {def?.tasks?.find((t) => t.id === i.task)?.name ?? i.task} #{i.no} {s.custom && <span className="chip warn">학생 작성 · 단원 표현인지 확인</span>} {i.isDemo && <span className="chip demo">예시</span>}</div>
                <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{s.en} <button className="btn ghost sm" onClick={() => speak(s.en)} aria-label="발음 듣기"><PixelIcon name="play" size={14} /></button></div>
                <div className="small muted">{s.ko} · 연습 {i.rounds?.length ?? 0}회 · 요청 {fmtDateTime(i.requestedAt)}</div>
                {last?.audioPath && <StorageAudio path={last.audioPath} />}
                {noteFor === i.id && (
                  <div className="row">
                    <input className="input sm" style={{ flex: 1, minWidth: 160 }} placeholder="학생에게 보여줄 메모 (예: haven't 발음 다시)" value={note} onChange={(e) => setNote(e.target.value)} />
                    <button className="btn danger sm" onClick={() => decide([i.id], "retry", note.trim())}>다시 보내기</button>
                  </div>
                )}
              </div>
              <div className="row actions">
                <button className="btn ok sm" onClick={() => decide([i.id], "checked")}>통과</button>
                <button className="btn ghost sm" onClick={() => setNoteFor(noteFor === i.id ? null : i.id)}>다시</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function AiChip({ review }: { review: { verdict: "ok" | "check" | "reject"; reason: string } }) {
  return (
    <div className="small">
      <span className={`chip ${review.verdict === "ok" ? "ok" : review.verdict === "check" ? "warn" : "red"}`}><PixelIcon name="robot" size={12} /> AI {review.verdict === "ok" ? "확인됨" : review.verdict === "check" ? "확인 필요" : "관련 없는 기록 같아요"}</span> <span className="muted">{review.reason}</span>
    </div>
  );
}
