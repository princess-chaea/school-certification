import { useState } from "react";
import { useConfig } from "../../lib/config";
import { useMySubmissions } from "../../lib/data";
import type { StudentDoc } from "../../lib/types";
import { fmtDate } from "../../lib/format";
import { StorageImage, StorageAudio, Lightbox, Empty } from "../../components/ui";
import type { ProgramId } from "../../../shared/domain";

export function Records({ student }: { student: StudentDoc }) {
  const config = useConfig();
  const { rows } = useMySubmissions(student.sid);
  const [filter, setFilter] = useState<ProgramId | "all">("all");
  const [zoom, setZoom] = useState<string | null>(null);
  const list = (rows ?? []).filter((r) => filter === "all" || r.program === filter);
  return (
    <div className="page narrow">
      <Lightbox url={zoom} onClose={() => setZoom(null)} />
      <h1>📒 내 기록</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        {(["all", "reading", "carbon", "english"] as const).map((f) => (
          <button key={f} className={`choice ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "전체" : `${config.programs[f].emoji} ${config.programs[f].name}`}
          </button>
        ))}
      </div>
      <div className="stack">
        {rows === null && <div className="muted">불러오는 중…</div>}
        {rows && list.length === 0 && <Empty>아직 기록이 없어요.</Empty>}
        {list.map((r) => (
          <div key={r.id} className={`card flat sub-card ${r.status === "deleted" ? "deleted" : ""}`}>
            {r.photoPath ? <StorageImage path={r.photoPath} onOpen={setZoom} /> : <div className="thumb">{r.audioPath ? "🎙️" : r.source === "teacher" ? "👀" : config.programs[r.program].emoji}</div>}
            <div className="stack" style={{ gap: 4 }}>
              <div className="row between">
                <b>
                  {r.program === "reading" ? r.bookTitle || "독서기록" : r.program === "carbon" ? r.activityType || "탄소중립 실천" : r.task === "t4" ? `펀리딩 낭독 ${r.bookTitle ?? ""}` : "알공 완료 화면"}
                </b>
                <span className="tiny">{fmtDate(r.createdAt)}</span>
              </div>
              {r.source === "teacher" && <span className="chip">선생님 확인 {r.count}회</span>}
              {r.text && <div className="small">{r.text}</div>}
              {r.audioPath && <StorageAudio path={r.audioPath} />}
              {r.status === "deleted" && <span className="chip red">선생님이 제외한 기록{r.deleteReason ? `: ${r.deleteReason}` : ""}</span>}
              {r.ai?.feedback && r.status !== "deleted" && <div className="small muted">💬 {r.ai.feedback}</div>}
              {r.ai?.question && r.status !== "deleted" && <div className="small" style={{ color: "var(--reading)" }}>🤔 {r.ai.question}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
