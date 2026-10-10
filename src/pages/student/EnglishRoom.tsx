import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { useConfig } from "../../lib/config";
import { useMyEnglishItems, useMySubmissions, useSentenceSet } from "../../lib/data";
import { completedRounds, itemId, ROUNDS_REQUIRED } from "../../lib/english";
import type { EnglishItem, StudentDoc } from "../../lib/types";
import { englishProgress, englishTaskForGrade } from "../../../shared/domain";
import { MedalBadge, Stamp, toast } from "../../components/ui";
import { playDingDong } from "../../lib/sound";

/** 과제 1~4 현황 + 선생님 확인(띵동) 실시간 알림 */
export function EnglishRoom({ student }: { student: StudentDoc }) {
  const config = useConfig();
  const { rows: items } = useMyEnglishItems(student.sid);
  const { rows: subs } = useMySubmissions(student.sid);
  const counts = student.progress?.english?.counts ?? { t1: 0, t2: 0, t3: 0, t4: 0 };
  const eng = englishProgress(config, counts);
  const ding = useDingOnCheck(items);

  const t2 = (subs ?? []).filter((s) => s.status === "active" && s.program === "english" && s.task === "t2").length;
  const t4 = (subs ?? []).filter((s) => s.status === "active" && s.program === "english" && s.task === "t4").length;

  return (
    <div className="page">
      {ding.stamp && <Stamp title="띵동!" sub={ding.stamp} onDone={ding.clear} />}
      <div className="row between">
        <h1>🗣️ 영어 연습실</h1>
        <div className="row"><MedalBadge medal={eng.medal} size="lg" /><span className="small muted">과제 {eng.completed}개 완료 · {config.englishMedalTasks.bronze}개면 인증</span></div>
      </div>
      <div className="grid grid-3">
        {config.englishTasks.map((raw) => {
          const task = englishTaskForGrade(raw, student.grade);
          const done = task.id === "t2" ? t2 : task.id === "t4" ? t4 : counts[task.id];
          const pct = Math.min(100, (done / task.goal) * 100);
          const to = task.kind === "sentences" ? `/english/set/${task.setIds![0]}` : `/submit/${task.id}`;
          return (
            <Link key={task.id} to={to} className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="row between">
                <h3>과제 {task.id.slice(1)} · {task.name}</h3>
                {done >= task.goal && <span className="chip ok">완료</span>}
              </div>
              <p className="small muted" style={{ minHeight: 40 }}>{task.description}</p>
              <div className="progress-bar"><div style={{ width: `${pct}%` }} /></div>
              <div className="small" style={{ marginTop: 6 }}><b>{Math.min(done, task.goal)}</b> / {task.goal}{task.kind === "sentences" ? "문장 통과" : task.kind === "audio" ? "권" : "장"}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

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

export function SentenceSetPage({ student, setId }: { student: StudentDoc; setId: string }) {
  const config = useConfig();
  const nav = useNavigate();
  const set = useSentenceSet(setId);
  const { rows: items } = useMyEnglishItems(student.sid);
  const ding = useDingOnCheck(items);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const byNo = useMemo(() => new Map((items ?? []).filter((i) => i.setId === setId).map((i) => [i.no, i])), [items, setId]);

  if (!set) return <div className="page">문장 세트를 불러오는 중…</div>;
  const task = config.englishTasks.find((t) => t.id === (setId.startsWith("task3") ? "t3" : "t1"));
  const checked = [...byNo.values()].filter((i) => i.status === "checked").length;
  const ready = [...byNo.values()].filter((i) => i.status === "ready");

  async function requestCheck(nos: number[]) {
    const batch = writeBatch(db);
    nos.forEach((no) => batch.update(doc(db, "englishItems", itemId(student.sid, setId, no)), { status: "requested", requestedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await batch.commit();
    toast(`${nos.length}문장 검사 요청 완료! 선생님께 말해 주세요 🙋`);
    setSelecting(false);
    setPicked(new Set());
  }

  return (
    <div className="page">
      {ding.stamp && <Stamp title="띵동!" sub={ding.stamp} onDone={ding.clear} />}
      <Link to="/english" className="small">← 영어 연습실</Link>
      <div className="row between">
        <h1>{set.title}</h1>
        <div className="small"><b style={{ fontSize: "1.4rem", color: "var(--ok)" }}>{checked}</b> / {task?.goal ?? set.goal} 통과</div>
      </div>
      <p className="small muted">문장을 눌러 연습해요. ① 해석 보고 영어로 쓰기 → ② 녹음하기를 {ROUNDS_REQUIRED}번 하면 선생님께 검사를 요청할 수 있어요.</p>
      {ready.length > 0 && (
        <div className="card row between" style={{ background: "var(--navy-50)", marginBottom: 12 }}>
          <span>🙋 검사 요청할 수 있는 문장이 <b>{ready.length}개</b> 있어요.</span>
          <div className="row">
            <button className="btn" onClick={() => requestCheck(ready.map((i) => i.no))}>모두 검사 요청</button>
            <button className="btn ghost" onClick={() => setSelecting((s) => !s)}>{selecting ? "선택 취소" : "골라서 요청"}</button>
            {selecting && picked.size > 0 && <button className="btn ok" onClick={() => requestCheck([...picked])}>{picked.size}개 요청</button>}
          </div>
        </div>
      )}
      <div className="sentence-grid">
        {set.items.map((s) => {
          const item = byNo.get(s.no);
          const rounds = completedRounds(item);
          const status = item?.status ?? "new";
          const label = s.type === "student" ? item?.custom?.ko || item?.custom?.en || `✏️ ${s.unit}단원 표현 직접 쓰기` : s.ko;
          return (
            <button
              key={s.no}
              className={`sentence-tile ${status}`}
              style={selecting && picked.has(s.no) ? { outline: "3px solid var(--navy)" } : undefined}
              onClick={() => {
                if (selecting && status === "ready") {
                  setPicked((p) => { const n = new Set(p); if (n.has(s.no)) n.delete(s.no); else n.add(s.no); return n; });
                } else nav(`/english/set/${setId}/${s.no}`);
              }}
            >
              <div className="row between"><span className="no">#{s.no}{s.unit ? ` · ${s.unit}단원` : ""}</span>{status === "checked" && <span>✅</span>}{status === "requested" && <span>⏳</span>}{status === "retry" && <span>↺</span>}</div>
              <div className="ko">{label}</div>
              <div className="dots">{Array.from({ length: ROUNDS_REQUIRED }, (_, i) => <i key={i} className={i < rounds ? "on" : ""} />)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
