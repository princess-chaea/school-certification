import { useMemo, useState } from "react";
import { doc, limit, orderBy, serverTimestamp, updateDoc, where, type QueryConstraint } from "firebase/firestore";
import { db } from "../../firebase";
import { useAiReviews, useCollection } from "../../lib/data";
import { AiChip } from "./Review";
import { sp, useSchoolId } from "../../lib/tenant";
import { useConfig } from "../../lib/config";
import { useSchool } from "../../lib/school";
import type { EnglishItem, Submission } from "../../lib/types";
import { EnglishGroupCard, englishGroups, recordTime } from "../../components/EnglishItemCard";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { Empty, Lightbox, StorageAudio, StorageImage, StorageLink, toast } from "../../components/ui";
import { PixelIcon } from "../../components/Pixel";
import { programById } from "../../../shared/domain";
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

  // 영어 문장 녹음(검사 요청·인정·다시 하기): 최근 바뀐 것부터, 학생·과제별로 묶어 함께 보여 줌
  const eCons: QueryConstraint[] = [where("year", "==", school.year), where("grade", "==", scope.grade)];
  if (scope.classNo) eCons.push(where("classNo", "==", scope.classNo));
  if (scope.program) eCons.push(where("program", "==", scope.program));
  eCons.push(orderBy("updatedAt", "desc"), limit(max * 5));
  const { rows: items } = useCollection<EnglishItem>(sp(schoolId, "englishItems"), eCons, [schoolId, school.year, scope.grade, scope.classNo, scope.program, max]);

  const names = useMemo(() => new Map((students ?? []).map((s) => [s.id, `${s.classNo}-${s.number} ${s.name}`])), [students]);
  const ai = useAiReviews(
    (rows ?? []).map((r) => r.id),
    (rows ?? []).filter((r) => config.ai.enabled && r.source === "student" &&
      (!r.createdAt || r.createdAt.toMillis() > Date.now() - 2 * 60_000)).map((r) => r.id),
  );
  const suspect = (id: string) => Boolean(ai.get(id) && ai.get(id)!.verdict !== "ok");
  const list = (rows ?? []).filter((r) => (showDeleted ? true : r.status !== "deleted")).filter((r) => (onlySuspect ? suspect(r.id) : true));
  const entries = [
    ...list.map((r) => ({ at: recordTime(r.createdAt), sub: r, group: null })),
    ...(onlySuspect ? [] : englishGroups(items, true).map((g) => ({ at: g.at, sub: null, group: g }))),
  ].sort((a, b) => b.at - a.at);
  const suspectCount = (rows ?? []).filter((r) => r.status !== "deleted" && suspect(r.id)).length;

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
      <PageHeader icon="log" title="기록" />
      <ScopeBar />
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`choice ${onlySuspect ? "on" : ""}`} onClick={() => setOnlySuspect((v) => !v)}><PixelIcon name="alert" size={16} /> AI가 확인 요청한 기록만 {suspectCount ? `(${suspectCount})` : ""}</button>
        <button className={`choice ${showDeleted ? "on" : ""}`} onClick={() => setShowDeleted((v) => !v)}><PixelIcon name="trash" size={16} /> 제외·반려한 기록도 보기</button>
      </div>
      {error && <div className="chip red">불러오지 못했어요: {error}</div>}
      <div className="stack">
        {rows === null && <div className="muted">불러오는 중…</div>}
        {rows && entries.length === 0 && <Empty>기록이 없어요.</Empty>}
        {entries.map(({ sub: r, group }) => group ? <EnglishGroupCard key={group.key} group={group} config={config} who={names.get(group.sid) ?? group.sid} /> : r && (
          <div key={r.id} className={`card flat sub-card ${r.status === "deleted" ? "deleted" : ""}`}>
            {r.photoPath ? <StorageImage path={r.photoPath} onOpen={setZoom} /> : <div className="thumb"><PixelIcon name={r.audioPath ? "mic" : r.source === "teacher" ? "eye" : programById(config, r.program)?.icon ?? "star"} size={32} /></div>}
            <div className="stack" style={{ gap: 4, minWidth: 0 }}>
              <div className="row between">
                <b>{names.get(r.sid) ?? r.sid} {r.isDemo && <span className="chip demo">예시</span>}</b>
                <span className="tiny">활동 {r.activityDate ? fmtDate(new Date(r.activityDate)) : fmtDate(r.createdAt)} · 올림 {fmtDateTime(r.createdAt)}</span>
              </div>
              <div className="small icon-text">
                <PixelIcon name={programById(config, r.program)?.icon ?? "star"} size={16} /> {programById(config, r.program)?.name ?? r.program}
                {r.task ? ` · ${programById(config, r.program)?.tasks?.find((t) => t.id === r.task)?.name ?? r.task}` : ""}
                {r.activityType && <span className="chip gray">{r.activityType}</span>}
                {r.status === "pending" && <span className="chip warn">확인 대기</span>}
                {r.status === "active" && r.reviewedByName && <span className="chip ok">인정 · {r.reviewedByName}</span>}
                {r.source === "teacher" && <span className="chip">교사 관찰 {r.count}회 · {r.createdByName}</span>}
              </div>
              {Object.entries(r.fields ?? {}).filter(([, v]) => v).map(([k, v]) => <div key={k} className="small"><span className="muted">{k}:</span> {v}</div>)}
              {r.text && <div className="small muted">“{r.text}”</div>}
              {r.link && <a className="small" href={r.link} target="_blank" rel="noreferrer">{r.link}</a>}
              <StorageLink path={r.filePath} name={r.fileName} />
              {r.audioPath && <StorageAudio path={r.audioPath} />}
              {ai.get(r.id) && <AiChip review={ai.get(r.id)!} />}
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
                <div><button className="btn ghost sm" onClick={() => { setDeleting(r.id); setReason(""); }}><PixelIcon name="trash" size={14} /> 비정상 기록 제외</button></div>
              )}
            </div>
          </div>
        ))}
        {rows && rows.length >= max && <button className="btn secondary" onClick={() => setMax((m) => m + PAGE)}>더 보기</button>}
      </div>
    </div>
  );
}
