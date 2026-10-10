import { useState } from "react";
import { useConfig } from "../../lib/config";
import { PageHeader } from "../../components/Layout";
import { useMySubmissions } from "../../lib/data";
import type { StudentDoc } from "../../lib/types";
import { fmtDate } from "../../lib/format";
import { StorageImage, StorageAudio, StorageLink, Lightbox, Empty } from "../../components/ui";
import { PixelIcon } from "../../components/Pixel";
import { activePrograms, programById } from "../../../shared/domain";

export function Records({ student }: { student: StudentDoc }) {
  const config = useConfig();
  const { rows } = useMySubmissions(student);
  const [filter, setFilter] = useState<string>("all");
  const [zoom, setZoom] = useState<string | null>(null);
  const list = (rows ?? []).filter((r) => filter === "all" || r.program === filter);
  return (
    <div className="page narrow">
      <Lightbox url={zoom} onClose={() => setZoom(null)} />
      <PageHeader icon="log" title="내 기록" />
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`choice ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>전체</button>
        {activePrograms(config, student.grade).map((p) => (
          <button key={p.id} className={`choice ${filter === p.id ? "on" : ""}`} onClick={() => setFilter(p.id)}><PixelIcon name={p.icon} size={16} /> {p.name}</button>
        ))}
      </div>
      <div className="stack">
        {rows === null && <div className="muted">불러오는 중…</div>}
        {rows && list.length === 0 && <Empty>아직 기록이 없어요.</Empty>}
        {list.map((r) => {
          const def = programById(config, r.program);
          const task = def?.tasks?.find((t) => t.id === r.task);
          return (
            <div key={r.id} className={`card flat sub-card ${r.status === "deleted" ? "deleted" : ""}`}>
              {r.photoPath ? <StorageImage path={r.photoPath} onOpen={setZoom} /> : <div className="thumb"><PixelIcon name={r.audioPath ? "mic" : r.source === "teacher" ? "eye" : def?.icon ?? "star"} size={32} /></div>}
              <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                <div className="row between">
                  <b>{def?.name ?? r.program}{task ? ` · ${task.name}` : ""}</b>
                  <span className="tiny">{r.activityDate ?? fmtDate(r.createdAt)}</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {r.status === "pending" && <span className="chip warn">선생님 확인 대기</span>}
                  {r.status === "active" && <span className="chip ok">인정 {r.reviewedByName ? `· ${r.reviewedByName}` : ""}</span>}
                  {r.status === "deleted" && <span className="chip red">인정되지 않음{r.deleteReason ? `: ${r.deleteReason}` : ""}</span>}
                  {r.source === "teacher" && <span className="chip">선생님 관찰 {r.count}회</span>}
                  {r.activityType && <span className="chip gray">{r.activityType}</span>}
                </div>
                {Object.entries(r.fields ?? {}).filter(([, v]) => v).map(([k, v]) => <div key={k} className="small"><span className="muted">{(task?.fields ?? def?.fields ?? []).find((f) => f.key === k)?.label ?? k}:</span> {v}</div>)}
                {r.text && <div className="small">{r.text}</div>}
                {r.link && <a className="small" href={r.link} target="_blank" rel="noreferrer">{r.link}</a>}
                <StorageLink path={r.filePath} name={r.fileName} />
                {r.audioPath && <StorageAudio path={r.audioPath} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
