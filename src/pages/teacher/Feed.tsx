import { useMemo, useState } from "react";
import { doc, limit, orderBy, serverTimestamp, updateDoc, where, type QueryConstraint } from "firebase/firestore";
import { db } from "../../firebase";
import { useCollection } from "../../lib/data";
import { sp, useSchoolId } from "../../lib/tenant";
import { useConfig } from "../../lib/config";
import { useSchool } from "../../lib/school";
import type { Submission } from "../../lib/types";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { Empty, Lightbox, StorageAudio, StorageImage, toast } from "../../components/ui";
import { PageHeader } from "../../components/Layout";
import { ScopeBar, useScope } from "./scope";
import { useScopedStudents } from "./Overview";

const PAGE = 60;

/** 제출 기록: AI 의심 표시, 비정상 기록 삭제(휴지통)·복구 */
export function Feed() {
  const schoolId = useSchoolId();
  const school = useSchool();
  const config = useConfig();
  const { scope, staff } = useScope();
  const { rows: students } = useScopedStudents();
  const [onlySuspect, setOnlySuspect] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [max, setMax] = useState(PAGE);
  const [zoom, setZoom] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const cons: QueryConstraint[] = [where("year", "==", school.year), where("grade", "==", scope.grade)];
  if (scope.classNo) cons.push(where("classNo", "==", scope.classNo));
  if (scope.program) cons.push(where("program", "==", scope.program));
  cons.push(orderBy("createdAt", "desc"), limit(max));
  const { rows, error } = useCollection<Submission>(sp(schoolId, "submissions"), cons, [schoolId, school.year, scope.grade, scope.classNo, scope.program, max]);

  const names = useMemo(() => new Map((students ?? []).map((s) => [s.id, `${s.classNo}-${s.number} ${s.name}`])), [students]);
  const list = (rows ?? []).filter((r) => (showDeleted ? true : r.status !== "deleted")).filter((r) => (onlySuspect ? r.ai && r.ai.verdict !== "ok" : true));
  const suspectCount = (rows ?? []).filter((r) => r.status === "active" && r.ai && r.ai.verdict !== "ok").length;

  async function remove(id: string) {
    await updateDoc(doc(db, sp(schoolId, `submissions/${id}`)), { status: "deleted", deletedBy: staff.name, deletedAt: serverTimestamp(), deleteReason: reason.trim() || "비정상 기록" });
    setDeleting(null);
    setReason("");
    toast("기록을 제외했어요. 진행률이 다시 계산돼요.");
  }
  async function restore(id: string) {
    await updateDoc(doc(db, sp(schoolId, `submissions/${id}`)), { status: "active", deleteReason: "", deletedBy: "", deletedAt: null });
    toast("기록을 되살렸어요.");
  }

  return (
    <div className="page">
      <Lightbox url={zoom} onClose={() => setZoom(null)} />
      <PageHeader title="📥 제출 기록" />
      <ScopeBar />
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`choice ${onlySuspect ? "on" : ""}`} onClick={() => setOnlySuspect((v) => !v)}>⚠️ AI가 확인 요청한 기록만 {suspectCount ? `(${suspectCount})` : ""}</button>
        <button className={`choice ${showDeleted ? "on" : ""}`} onClick={() => setShowDeleted((v) => !v)}>🗑️ 제외한 기록도 보기</button>
      </div>
      {error && <div className="chip red">불러오지 못했어요: {error}</div>}
      <div className="stack">
        {rows === null && <div className="muted">불러오는 중…</div>}
        {rows && list.length === 0 && <Empty>기록이 없어요.</Empty>}
        {list.map((r) => (
          <div key={r.id} className={`card flat sub-card ${r.status === "deleted" ? "deleted" : ""}`}>
            {r.photoPath ? <StorageImage path={r.photoPath} onOpen={setZoom} /> : <div className="thumb">{r.audioPath ? "🎙️" : r.source === "teacher" ? "👀" : config.programs[r.program].emoji}</div>}
            <div className="stack" style={{ gap: 4, minWidth: 0 }}>
              <div className="row between">
                <b>{names.get(r.sid) ?? r.sid} {r.isDemo && <span className="chip demo">예시</span>}</b>
                <span className="tiny">활동 {r.activityDate ? fmtDate(new Date(r.activityDate)) : fmtDate(r.createdAt)} · 올림 {fmtDateTime(r.createdAt)}</span>
              </div>
              <div className="small">
                {config.programs[r.program].emoji}{" "}
                {r.program === "reading" ? r.bookTitle || "독서기록" : r.program === "carbon" ? r.activityType || "탄소중립" : r.task === "t4" ? `펀리딩 낭독 ${r.bookTitle ?? ""} (${r.durationSec ?? 0}초)` : "알공 완료"}
                {r.source === "teacher" && <span className="chip" style={{ marginLeft: 6 }}>교사 관찰 {r.count}회 · {r.createdByName}</span>}
              </div>
              {r.text && <div className="small muted">“{r.text}”</div>}
              {r.audioPath && <StorageAudio path={r.audioPath} />}
              {r.ai && (
                <div className="small">
                  <span className={`chip ${r.ai.verdict === "ok" ? "ok" : r.ai.verdict === "check" ? "warn" : "red"}`}>
                    AI {r.ai.verdict === "ok" ? "확인됨" : r.ai.verdict === "check" ? "선생님 확인 필요" : "관련 없는 사진 같아요"}
                  </span>{" "}
                  <span className="muted">{r.ai.reason}</span>
                </div>
              )}
              {r.status === "deleted" ? (
                <div className="row">
                  <span className="chip red">제외됨: {r.deleteReason} ({r.deletedBy})</span>
                  <button className="btn ghost sm" onClick={() => restore(r.id)}>되살리기</button>
                </div>
              ) : deleting === r.id ? (
                <div className="row">
                  <input className="input sm" style={{ flex: 1, minWidth: 160 }} placeholder="제외 사유 (예: 중복, 관련 없는 사진)" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button className="btn danger sm" onClick={() => remove(r.id)}>제외</button>
                  <button className="btn ghost sm" onClick={() => setDeleting(null)}>취소</button>
                </div>
              ) : (
                <div><button className="btn ghost sm" onClick={() => { setDeleting(r.id); setReason(""); }}>🗑️ 비정상 기록 제외</button></div>
              )}
            </div>
          </div>
        ))}
        {rows && rows.length >= max && <button className="btn secondary" onClick={() => setMax((m) => m + PAGE)}>더 보기</button>}
      </div>
    </div>
  );
}
