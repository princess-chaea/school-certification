import { ProgramFilter } from "../../components/ProgramFilter";
import { useState } from "react";
import { useConfig } from "../../lib/config";
import { PageHeader } from "../../components/Layout";
import { useMyEnglishItems, useMySubmissions } from "../../lib/data";
import { EnglishGroupCard, englishGroups, recordTime } from "../../components/EnglishItemCard";
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
  const { rows: items } = useMyEnglishItems(student);
  const list = (rows ?? []).filter((r) => filter === "all" || r.program === filter);
  const english = englishGroups(items).filter((g) => filter === "all" || g.program === filter);
  // 올린 기록(사진·글·녹음 파일)과 영어 문장 녹음을 시간순으로 함께 보여 줌
  const entries = [
    ...list.map((r) => ({ at: recordTime(r.createdAt), sub: r, item: null })),
    ...english.map((g) => ({ at: g.at, sub: null, item: g })),
  ].sort((a, b) => b.at - a.at);
  return (
    <div className="page narrow">
      <Lightbox url={zoom} onClose={() => setZoom(null)} />
      <PageHeader icon="log" title="내 기록" />
      <div style={{ marginBottom: 12 }}>
        <ProgramFilter programs={activePrograms(config, student.grade)} value={filter === "all" ? null : filter} onChange={(id) => setFilter(id ?? "all")} />
      </div>
      <div className="stack">
        {rows === null && <div className="muted">불러오는 중…</div>}
        {rows && entries.length === 0 && <Empty>아직 기록이 없어요.</Empty>}
        {entries.map(({ sub: r, item }) => {
          if (item) return <EnglishGroupCard key={item.key} group={item} config={config} />;
          if (!r) return null;
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
                  {r.source === "teacher" && <span className="chip">{r.recognitionMode === "offline" ? "오프라인 인정" : "선생님 관찰"} {r.count}{task?.kind === "sentences" ? "문장" : task ? "회" : def?.unit ?? "회"}</span>}
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
