import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { sp, useSchoolId } from "../../lib/tenant";
import { useMyEnglishItems, useSentenceSet } from "../../lib/data";
import { completedRounds, itemId, ROUNDS_REQUIRED } from "../../lib/english";
import type { EnglishItem, StudentDoc } from "../../lib/types";
import type { ProgramDef, TaskDef } from "../../../shared/domain";
import { taskSetIds } from "../../../shared/domain";
import { Stamp, toast } from "../../components/ui";
import { PageHeader } from "../../components/Layout";
import { PixelIcon } from "../../components/Pixel";
import { playDingDong } from "../../lib/sound";

/** 내 문장이 checked 로 바뀌는 순간 띵동 + 도장 */
export function useDingOnCheck(items: EnglishItem[] | null) {
  const prev = useRef<Map<string, string> | null>(null);
  const [stamp, setStamp] = useState<string | null>(null);
  useEffect(() => {
    if (!items) return;
    const now = new Map(items.map((i) => [i.id, i.status]));
    if (prev.current) {
      const newly = items.filter((i) => i.status === "checked" && prev.current!.get(i.id) !== "checked");
      if (newly.length) {
        playDingDong();
        setStamp(newly.length === 1 ? `${newly[0].no}번 문장 통과!` : `${newly.length}문장 통과!`);
      }
    }
    prev.current = now;
  }, [items]);
  return { stamp, clear: () => setStamp(null) };
}

export function SentenceSetPage({ student, program, task }: { student: StudentDoc; program: ProgramDef; task: TaskDef }) {
  const schoolId = useSchoolId();
  const nav = useNavigate();
  const setId = taskSetIds(task, student.grade)[0];
  const set = useSentenceSet(setId);
  const { rows: items } = useMyEnglishItems(student);
  const ding = useDingOnCheck(items);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const byNo = useMemo(() => new Map((items ?? []).filter((i) => i.setId === setId && i.program === program.id).map((i) => [i.no, i])), [items, setId, program.id]);
  const base = `/do/${program.id}/${task.id}`;

  if (!set) return <div className="page">문장 세트를 불러오는 중…</div>;
  const checked = [...byNo.values()].filter((i) => i.status === "checked").length;
  const ready = [...byNo.values()].filter((i) => i.status === "ready");

  async function requestCheck(nos: number[]) {
    const batch = writeBatch(db);
    nos.forEach((no) => batch.update(doc(db, sp(schoolId, `englishItems/${itemId(student.year, student.sid, setId, no)}`)), { status: "requested", requestedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await batch.commit();
    toast(`${nos.length}문장 검사 요청 완료! 선생님께 말해 주세요`);
    setSelecting(false);
    setPicked(new Set());
  }

  return (
    <div className="page">
      {ding.stamp && <Stamp title="DING DONG!" sub={ding.stamp} onDone={ding.clear} />}
      <PageHeader back={`/do/${program.id}`} icon={program.icon} title={task.name} right={<span className="hud"><b style={{ fontSize: "1.4rem", color: "var(--ok)" }}>{checked}</b> / {task.goal}</span>} />
      <p className="small muted" style={{ marginTop: -4 }}>문장을 눌러 연습해요. STEP 1 해석 보고 영어로 쓰기 → STEP 2 녹음하기를 {ROUNDS_REQUIRED}번 하면 선생님께 검사를 요청할 수 있어요.</p>
      {ready.length > 0 && (
        <div className="card px-card row between" style={{ background: "var(--navy-50)", marginBottom: 12 }}>
          <span className="icon-text"><PixelIcon name="hand" size={20} /> 검사 요청할 수 있는 문장 <b>{ready.length}개</b></span>
          <div className="row">
            <button className="btn" onClick={() => requestCheck(ready.map((i) => i.no))}>모두 검사 요청</button>
            {selecting && picked.size > 0 && <button className="btn ok" onClick={() => requestCheck([...picked])}>{picked.size}개 요청</button>}
            <button className="btn ghost" onClick={() => setSelecting((s) => !s)}>{selecting ? "선택 취소" : "골라서 요청"}</button>
          </div>
        </div>
      )}
      <div className="sentence-grid">
        {set.items.map((s) => {
          const item = byNo.get(s.no);
          const rounds = completedRounds(item);
          const status = item?.status ?? "new";
          const label = s.type === "student" ? item?.custom?.ko || item?.custom?.en || `${s.unit}단원 표현 직접 쓰기` : s.ko;
          return (
            <button
              key={s.no}
              className={`sentence-tile ${status}`}
              style={selecting && picked.has(s.no) ? { outline: "3px solid var(--navy)" } : undefined}
              onClick={() => {
                if (selecting && status === "ready") setPicked((p) => { const n = new Set(p); if (n.has(s.no)) n.delete(s.no); else n.add(s.no); return n; });
                else nav(`${base}/${s.no}`);
              }}
            >
              <div className="row between">
                <span className="no hud">{set.itemLabel ? `${set.itemLabel} ${s.no}` : `#${s.no}`}{s.unit ? ` · ${s.unit}단원` : ""}</span>
                {status === "checked" && <PixelIcon name="check" size={18} />}
                {status === "requested" && <PixelIcon name="clock" size={18} />}
                {status === "retry" && <PixelIcon name="alert" size={18} />}
                {s.type === "student" && status === "new" && <PixelIcon name="pen" size={18} />}
              </div>
              <div className="ko">{label}</div>
              <div className="dots">{Array.from({ length: ROUNDS_REQUIRED }, (_, i) => <i key={i} className={i < rounds ? "on" : ""} />)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
