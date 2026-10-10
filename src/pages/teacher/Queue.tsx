import { useMemo, useState } from "react";
import { doc, orderBy, serverTimestamp, where, writeBatch, type QueryConstraint } from "firebase/firestore";
import { db } from "../../firebase";
import { BUNDLED_SETS, useCollection } from "../../lib/data";
import { sp, useSchoolId } from "../../lib/tenant";
import { useSchool } from "../../lib/school";
import type { EnglishItem } from "../../lib/types";
import { fmtDateTime } from "../../lib/format";
import { Empty, StorageAudio, toast } from "../../components/ui";
import { PageHeader } from "../../components/Layout";
import { ScopeBar, useScope } from "./scope";
import { useScopedStudents } from "./Overview";
import { speak } from "../../lib/speech";

/** 영어 검사 대기열: 학생이 3회 연습 후 요청한 문장 → 통과(띵동) / 다시 */
export function Queue() {
  const schoolId = useSchoolId();
  const school = useSchool();
  const { scope, staff } = useScope();
  const { rows: students } = useScopedStudents();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const cons: QueryConstraint[] = [where("year", "==", school.year), where("grade", "==", scope.grade)];
  if (scope.classNo) cons.push(where("classNo", "==", scope.classNo));
  cons.push(where("status", "==", "requested"), orderBy("requestedAt", "asc"));
  const { rows, error } = useCollection<EnglishItem>(sp(schoolId, "englishItems"), cons, [schoolId, school.year, scope.grade, scope.classNo]);
  const names = useMemo(() => new Map((students ?? []).map((s) => [s.id, `${s.classNo}-${s.number} ${s.name}`])), [students]);
  const list = rows ?? [];

  function sentence(i: EnglishItem) {
    if (i.custom?.en) return { en: i.custom.en, ko: i.custom.ko, custom: true };
    const s = BUNDLED_SETS[i.setId]?.items.find((x) => x.no === i.no);
    return { en: s?.en ?? "", ko: s?.ko ?? "", custom: false };
  }

  async function decide(ids: string[], status: "checked" | "retry", teacherNote = "") {
    const batch = writeBatch(db);
    ids.forEach((id) =>
      batch.update(doc(db, sp(schoolId, `englishItems/${id}`)), {
        status,
        checkedBy: staff.uid,
        checkedByName: staff.name,
        checkedAt: serverTimestamp(),
        teacherNote,
        updatedAt: serverTimestamp(),
      }),
    );
    await batch.commit();
    setPicked(new Set());
    setNoteFor(null);
    setNote("");
    toast(status === "checked" ? `${ids.length}문장 통과! 학생 화면에 띵동 🔔` : "다시 해 보기로 돌려보냈어요.");
  }

  return (
    <div className="page">
      <PageHeader title="🙋 영어 검사 대기열" right={<span className="chip warn">대기 {list.length}건</span>} />
      <ScopeBar showProgram={false} />
      <p className="small muted" style={{ marginTop: -4 }}>학생이 선생님 앞에서 문장을 말하면 ✔ 통과를 눌러 주세요. 나중에 몰아서 확인할 때는 ▶ 녹음을 들을 수 있어요.</p>
      {error && <div className="chip red">불러오지 못했어요: {error}</div>}
      {list.length > 0 && (
        <div className="row" style={{ marginBottom: 10 }}>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={picked.size === list.length} onChange={(e) => setPicked(e.target.checked ? new Set(list.map((i) => i.id)) : new Set())} /> 모두 선택
          </label>
          <button className="btn ok" disabled={!picked.size} onClick={() => decide([...picked], "checked")}>✔ 선택한 {picked.size}문장 통과</button>
        </div>
      )}
      <div className="stack">
        {rows === null && <div className="muted">불러오는 중…</div>}
        {rows && list.length === 0 && <Empty>검사를 기다리는 문장이 없어요. 🎉</Empty>}
        {list.map((i) => {
          const s = sentence(i);
          const last = [...(i.rounds ?? [])].reverse().find((r) => r.audioPath && r.audioPath !== "demo");
          return (
            <div key={i.id} className="card flat queue-row">
              <input type="checkbox" checked={picked.has(i.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} aria-label="선택" />
              <div className="stack" style={{ gap: 3, minWidth: 0 }}>
                <div className="small"><b>{names.get(i.sid) ?? i.sid}</b> · {i.task === "t1" ? "과제1" : "과제3"} #{i.no} {s.custom && <span className="chip warn">학생 작성 · 단원 표현인지 확인</span>} {i.isDemo && <span className="chip demo">예시</span>}</div>
                <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{s.en} <button className="btn ghost sm" onClick={() => speak(s.en)} aria-label="발음 듣기">🔊</button></div>
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
                <button className="btn ok sm" onClick={() => decide([i.id], "checked")}>✔ 통과</button>
                <button className="btn ghost sm" onClick={() => setNoteFor(noteFor === i.id ? null : i.id)}>↺ 다시</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
