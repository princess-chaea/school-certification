import { useState } from "react";
import type { Timestamp } from "firebase/firestore";
import type { AppConfig } from "../../shared/domain";
import { programById } from "../../shared/domain";
import type { EnglishItem } from "../lib/types";
import { fmtDate } from "../lib/format";
import { PixelIcon } from "./Pixel";
import { StorageAudio } from "./ui";

/** 기록 목록 정렬용 시각 */
export function recordTime(t?: Timestamp | null) {
  return t?.toMillis?.() ?? 0;
}
const itemTime = (i: EnglishItem) => recordTime(i.checkedAt ?? i.requestedAt);

export interface EnglishGroup {
  key: string;
  program: string;
  task: string;
  items: EnglishItem[]; // 최근 순
  at: number;
}

/** 선생님께 보낸 영어 문장(검사 요청·인정·다시 하기)을 과제별로 묶음 — 문장마다 한 줄씩 늘어나지 않게 */
export function englishGroups(items: EnglishItem[] | null): EnglishGroup[] {
  const map = new Map<string, EnglishGroup>();
  for (const i of items ?? []) {
    if (i.status !== "requested" && i.status !== "checked" && i.status !== "retry") continue;
    const key = `${i.program}/${i.task}`;
    const g = map.get(key) ?? { key, program: i.program, task: i.task, items: [], at: 0 };
    g.items.push(i);
    g.at = Math.max(g.at, itemTime(i));
    map.set(key, g);
  }
  for (const g of map.values()) g.items.sort((a, b) => itemTime(b) - itemTime(a));
  return [...map.values()];
}

/** 영어 문장 녹음 기록 (과제 하나 = 카드 하나): 학생 [내 기록]·홈 최근 기록·교사 학생 상세 공통 */
export function EnglishGroupCard({ group, config, compact }: { group: EnglishGroup; config: AppConfig; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const def = programById(config, group.program);
  const task = def?.tasks?.find((t) => t.id === group.task);
  const checked = group.items.filter((i) => i.status === "checked").length;
  const waiting = group.items.filter((i) => i.status === "requested").length;
  const retry = group.items.filter((i) => i.status === "retry").length;
  const title = `${def?.name ?? group.program}${task ? ` · ${task.name}` : ""}`;
  const chips = (
    <>
      <span className="chip ok">인정 {checked}{task ? `/${task.goal}` : ""}문장</span>
      {waiting > 0 && <span className="chip warn">확인 대기 {waiting}</span>}
      {retry > 0 && <span className="chip red">다시 해 보기 {retry}</span>}
    </>
  );
  const date = group.at ? fmtDate(new Date(group.at)) : "";
  if (compact) {
    return (
      <div className="card flat row" style={{ alignItems: "flex-start" }}>
        <PixelIcon name={def?.icon ?? "speech"} size={28} />
        <div style={{ flex: 1 }}>
          <div className="small"><b>{title}</b> <span className="tiny">{date}</span> {chips}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="card flat sub-card">
      <div className="thumb"><PixelIcon name="mic" size={32} /></div>
      <div className="stack" style={{ gap: 4, minWidth: 0 }}>
        <div className="row between">
          <b>{title}</b>
          <span className="tiny">{date}</span>
        </div>
        <div className="row" style={{ gap: 6 }}>{chips}</div>
        <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(!open)}>{open ? "접기" : `문장별 녹음 보기 (${group.items.length})`}</button>
        {open && (
          <div className="stack" style={{ gap: 8 }}>
            {group.items.map((i) => {
              const audio = [...(i.rounds ?? [])].reverse().find((r) => r.audioPath)?.audioPath;
              return (
                <div key={i.id} className="stack" style={{ gap: 2 }}>
                  <div className="small">
                    <b>{i.no}번</b> {i.custom?.en ?? ""}{" "}
                    {i.status === "checked" ? <span className="chip ok">인정{i.checkedByName ? ` · ${i.checkedByName}` : ""}</span>
                      : i.status === "retry" ? <span className="chip red">다시 해 보기{i.teacherNote ? `: ${i.teacherNote}` : ""}</span>
                      : <span className="chip warn">확인 대기</span>}
                  </div>
                  {audio && <StorageAudio path={audio} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
