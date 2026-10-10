import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/Layout";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { sp, useSchoolId } from "../../lib/tenant";
import { db } from "../../firebase";
import { useConfig } from "../../lib/config";
import { useRecorder } from "../../lib/useRecorder";
import { newId, uploadBlob } from "../../lib/media";
import { fmtSec } from "../../lib/format";
import type { StudentDoc } from "../../lib/types";
import { Stamp, toast } from "../../components/ui";
import { playFanfare } from "../../lib/sound";

/** 영어 과제 4: EBSe 펀리딩 동화책 2분 이상 낭독 녹음 */
export function AudioSubmit({ student }: { student: StudentDoc }) {
  const schoolId = useSchoolId();
  const config = useConfig();
  const nav = useNavigate();
  const task = config.englishTasks.find((t) => t.id === "t4")!;
  const minMs = (task.minSeconds ?? 120) * 1000;
  const rec = useRecorder(6 * 60_000);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(false);
  const longEnough = (rec.recording?.durationMs ?? 0) >= minMs;

  async function submit() {
    if (!rec.recording) return;
    setBusy(true);
    try {
      const ext = rec.recording.mime.includes("mp4") ? "m4a" : rec.recording.mime.includes("ogg") ? "ogg" : "webm";
      const path = `schools/${schoolId}/uploads/${student.sid}/english/t4-${newId()}.${ext}`;
      await uploadBlob(path, rec.recording.blob, rec.recording.mime);
      await addDoc(collection(db, sp(schoolId, "submissions")), {
        sid: student.sid, year: student.year, grade: student.grade, classNo: student.classNo,
        program: "english", task: "t4", bookTitle: title.trim(), audioPath: path,
        durationSec: Math.round(rec.recording.durationMs / 1000),
        status: "active", source: "student", count: 1, createdAt: serverTimestamp(),
      });
      playFanfare();
      setStamp(true);
    } catch (e) {
      toast("올리지 못했어요: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      {stamp && <Stamp title="Great job!" sub="낭독 녹음 완료" onDone={() => nav("/english")} />}
      <PageHeader back="/english" title="📖 EBSe 펀리딩 낭독 녹음" />
      <ol className="small muted" style={{ lineHeight: 1.8 }}>
        <li><a href={task.link} target="_blank" rel="noreferrer">펀리딩 사이트 열기 ↗</a>에서 동화책을 골라요.</li>
        <li>책 제목을 적고 🎙️ 버튼을 눌러 <b>{Math.round(minMs / 60000)}분 이상</b> 소리 내어 읽어요.</li>
        <li>다 읽으면 ⏹ 멈추고, 들어 본 뒤 제출해요. (총 {task.goal}권)</li>
      </ol>
      <div className="card stack" style={{ alignItems: "center" }}>
        <input className="input" placeholder="동화책 제목" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className={`rec-btn ${rec.state === "recording" ? "on" : ""}`} onClick={() => (rec.state === "recording" ? rec.stop() : rec.start())} aria-label="녹음">
          {rec.state === "recording" ? "⏹" : "🎙️"}
        </button>
        <div style={{ fontSize: "1.6rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {fmtSec(rec.state === "recording" ? rec.elapsed : rec.recording?.durationMs ?? 0)}
        </div>
        {rec.state === "recording" && (
          <div className="progress-bar" style={{ width: "100%" }}>
            <div style={{ width: `${Math.min(100, (rec.elapsed / minMs) * 100)}%`, background: rec.elapsed >= minMs ? "var(--ok)" : undefined }} />
          </div>
        )}
        {rec.error && <div className="chip red">{rec.error}</div>}
        {rec.recording && rec.state === "done" && (
          <>
            <audio controls src={rec.recording.url} style={{ width: "100%" }} />
            {!longEnough && <div className="chip warn">아직 {fmtSec(minMs - rec.recording.durationMs)} 더 읽어야 해요. 다시 녹음해 볼까요?</div>}
            <div className="row">
              <button className="btn ghost" onClick={rec.reset}>다시 녹음</button>
              <button className="btn ok big" disabled={!longEnough || !title.trim() || busy} onClick={submit}>{busy ? "올리는 중…" : "제출하기"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
