import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { sp, useSchoolId } from "../../lib/tenant";
import { db } from "../../firebase";
import { useMyEnglishItems, useSentenceSet } from "../../lib/data";
import { completedRounds, itemId, ROUNDS_REQUIRED, statusLabel, targetOf } from "../../lib/english";
import { uploadBlob } from "../../lib/media";
import { useRecorder } from "../../lib/useRecorder";
import { playCorrect, playWrong } from "../../lib/sound";
import { recognizeOnce, speak, speechRecognitionSupported } from "../../lib/speech";
import { diffWords, firstLetterHint, isCorrectAnswer, speechMatchRatio } from "../../../shared/typing";
import { fmtSec } from "../../lib/format";
import type { EnglishItem, EnglishRound, StudentDoc } from "../../lib/types";
import { Stamp, toast } from "../../components/ui";
import { PageHeader } from "../../components/Layout";
import { useDingOnCheck } from "./SentenceSet";
import type { ProgramDef, TaskDef } from "../../../shared/domain";
import { taskSetIds } from "../../../shared/domain";
import { PixelIcon } from "../../components/Pixel";

type Step = "type" | "record" | "saved";

export function SentencePractice({ student, program, task: taskDef, no }: { student: StudentDoc; program: ProgramDef; task: TaskDef; no: number }) {
  const setId = taskSetIds(taskDef, student.grade)[0];
  const base = `/do/${program.id}/${taskDef.id}`;
  const schoolId = useSchoolId();
  const nav = useNavigate();
  const set = useSentenceSet(setId);
  const { rows: items } = useMyEnglishItems(student);
  const ding = useDingOnCheck(items);
  const s = set?.items.find((x) => x.no === no);
  const item = useMemo(() => items?.find((i) => i.setId === setId && i.no === no), [items, setId, no]);
  const id = itemId(student.year, student.sid, setId, no);
  const task = taskDef.id;

  const [step, setStep] = useState<Step>("type");
  const [typed, setTyped] = useState("");
  const [attempts, setAttempts] = useState<string[]>([]);
  const [wrong, setWrong] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [stt, setStt] = useState<{ text: string; ratio: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const rec = useRecorder(30_000);

  // 문장이 바뀌면 처음부터
  useEffect(() => {
    setStep("type");
    setTyped("");
    setAttempts([]);
    setWrong(false);
    setShowHint(false);
    setStt(null);
    rec.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId, no]);

  if (!set || !s || items === null) return <div className="page">불러오는 중…</div>;
  const target = targetOf(s, item);
  const rounds = completedRounds(item);
  const status = item?.status ?? "new";
  const prevNo = set.items.find((x) => x.no === no - 1)?.no;
  const nextNo = set.items.find((x) => x.no === no + 1)?.no;
  const locked = status === "checked" || status === "requested";

  if (s.type === "student" && !item?.custom?.en) {
    return <CustomSentenceForm student={student} program={program.id} base={base} setId={setId} no={no} unit={s.unit ?? 0} task={task} prompt={s.prompt} />;
  }

  function check() {
    if (!typed.trim()) return;
    const tries = [...attempts, typed];
    setAttempts(tries);
    if (isCorrectAnswer(typed, target.en, target.alternatives)) {
      playCorrect();
      setWrong(false);
      setStep("record");
      speak(target.en);
    } else {
      playWrong();
      setWrong(true);
    }
  }

  async function checkPronunciation() {
    try {
      toast("문장을 말해 보세요…");
      const text = await recognizeOnce();
      setStt({ text, ratio: speechMatchRatio(text, target.en) });
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async function saveRound() {
    if (!rec.recording) return;
    setSaving(true);
    try {
      const ext = rec.recording.mime.includes("mp4") ? "m4a" : rec.recording.mime.includes("ogg") ? "ogg" : "webm";
      // 문장마다 최신 녹음 1개만 보관 (덮어쓰기)
      const path = `schools/${schoolId}/uploads/${student.sid}/english/${setId}-${no}.${ext}`;
      await uploadBlob(path, rec.recording.blob, rec.recording.mime);
      const round: EnglishRound = {
        typedOk: true,
        attempts: attempts.length,
        audioPath: path,
        durationMs: rec.recording.durationMs,
        at: Date.now(),
        ...(stt ? { sttText: stt.text } : {}),
      };
      const nextRounds = [...(item?.rounds ?? []), round];
      const done = nextRounds.filter((r) => r.typedOk && r.audioPath).length;
      const nextStatus: EnglishItem["status"] = status === "retry" || done >= ROUNDS_REQUIRED ? "ready" : "practicing";
      if (item) {
        await updateDoc(doc(db, sp(schoolId, "englishItems"), id), { rounds: nextRounds, status: nextStatus, updatedAt: serverTimestamp() });
      } else {
        await setDoc(doc(db, sp(schoolId, "englishItems"), id), {
          sid: student.sid, year: student.year, grade: student.grade, classNo: student.classNo, program: program.id, setId, task, no,
          rounds: nextRounds, status: nextStatus, updatedAt: serverTimestamp(),
        });
      }
      setStep("saved");
    } catch (e) {
      toast("저장하지 못했어요: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function requestCheck() {
    await updateDoc(doc(db, sp(schoolId, "englishItems"), id), { status: "requested", requestedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    toast("검사 요청 완료! 선생님께 말해 주세요");
  }

  function again() {
    setStep("type");
    setTyped("");
    setAttempts([]);
    setWrong(false);
    setShowHint(false);
    setStt(null);
    rec.reset();
  }

  return (
    <div className="page narrow">
      {ding.stamp && <Stamp title="띵동!" sub={ding.stamp} onDone={ding.clear} />}
      <PageHeader
        back={base}
        title={<>문장 #{no}</>}
        right={
          <>
            <button className="btn ghost sm" disabled={!prevNo} onClick={() => prevNo && nav(`${base}/${prevNo}`)}>이전</button>
            <button className="btn ghost sm" disabled={!nextNo} onClick={() => nextNo && nav(`${base}/${nextNo}`)}>다음</button>
          </>
        }
      />

      <div className="card stack" style={{ marginTop: 10 }}>
        <div className="row between">
          <span className="chip">{statusLabel(status)}</span>
          <div className="row small">
            <span>연습 {Math.min(rounds, ROUNDS_REQUIRED)} / {ROUNDS_REQUIRED}회</span>
            <div className="dots">{Array.from({ length: ROUNDS_REQUIRED }, (_, i) => <i key={i} className={i < rounds ? "on" : ""} />)}</div>
          </div>
        </div>
        {item?.teacherNote && status === "retry" && <div className="chip red">선생님: {item.teacherNote}</div>}

        <div className="practice-ko">{target.ko || "(뜻 없음)"}</div>

        {status === "checked" ? (
          <div className="stack" style={{ alignItems: "center" }}>
            <div className="answer-reveal">{target.en}</div>
            <div className="chip ok"><PixelIcon name="check" size={14} /> {item?.checkedByName ?? "선생님"} 확인 완료</div>
            <button className="btn secondary" onClick={() => speak(target.en)}><PixelIcon name="play" size={16} /> 다시 듣기</button>
          </div>
        ) : status === "requested" ? (
          <div className="stack" style={{ alignItems: "center" }}>
            <div className="answer-reveal">{target.en}</div>
            <div className="chip warn"><PixelIcon name="clock" size={14} /> 선생님 검사를 기다리는 중이에요. 선생님 앞에서 말해 보세요!</div>
            <button className="btn secondary" onClick={() => speak(target.en)}><PixelIcon name="play" size={16} /> 듣기</button>
          </div>
        ) : step === "type" ? (
          <>
            <div className="small muted hud" style={{ textAlign: "center" }}>STEP 1 · 위 뜻을 영어 문장으로 써 보세요</div>
            <input
              className="input type-input"
              value={typed}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onPaste={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              onChange={(e) => { setTyped(e.target.value); setWrong(false); }}
              onKeyDown={(e) => e.key === "Enter" && check()}
              placeholder="영어로 입력"
              aria-label="영어 문장 입력"
            />
            {wrong && (
              <div className="stack" style={{ alignItems: "center" }}>
                <div className="diff">
                  {diffWords(typed, target.en).map((t, i) => (
                    <span key={i} className={t.kind}>{t.kind === "missing" ? "＿".repeat(Math.max(2, Math.ceil(t.word.length / 2))) : t.word}</span>
                  ))}
                </div>
                <div className="tiny">초록: 맞은 단어 · 밑줄: 빠진 단어 · 빨강: 고쳐야 할 단어</div>
              </div>
            )}
            {showHint && <div className="answer-reveal" style={{ fontSize: "1.1rem", letterSpacing: ".05em" }}>힌트: {firstLetterHint(target.en)}</div>}
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn big" onClick={check} disabled={!typed.trim()}>확인</button>
              {attempts.length >= 2 && !showHint && <button className="btn secondary" onClick={() => setShowHint(true)}><PixelIcon name="sparkle" size={16} /> 힌트</button>}
            </div>
          </>
        ) : step === "record" ? (
          <div className="stack" style={{ alignItems: "center" }}>
            <div className="answer-reveal"><PixelIcon name="check" size={22} /> {target.en}</div>
            <button className="btn secondary" onClick={() => speak(target.en)}><PixelIcon name="play" size={16} /> 원어민 발음 듣기</button>
            <div className="small muted hud">STEP 2 · 녹음 버튼을 누르고 문장을 말한 뒤 다시 눌러요</div>
            <button className={`rec-btn ${rec.state === "recording" ? "on" : ""}`} onClick={() => (rec.state === "recording" ? rec.stop() : rec.start())} aria-label="녹음">
              <PixelIcon name={rec.state === "recording" ? "close" : "mic"} size={44} recolor={rec.state === "recording" ? { r: "#ffffff" } : undefined} />
            </button>
            <div className="small">{rec.state === "recording" ? `녹음 중 ${fmtSec(rec.elapsed)}` : rec.recording ? `${fmtSec(rec.recording.durationMs)} 녹음됨` : ""}</div>
            {rec.error && <div className="chip red">{rec.error}</div>}
            {rec.recording && rec.state === "done" && (
              <>
                <audio controls src={rec.recording.url} />
                {rec.recording.durationMs < 1000 && <div className="chip warn">너무 짧아요. 다시 녹음해 주세요.</div>}
                {speechRecognitionSupported() && (
                  <button className="btn ghost sm" onClick={checkPronunciation}><PixelIcon name="eye" size={16} /> 발음 스스로 점검 (선택)</button>
                )}
                {stt && (
                  <div className="small" style={{ textAlign: "center" }}>
                    들린 문장: “{stt.text || "(못 알아들음)"}” · 일치 {Math.round(stt.ratio * 100)}%
                    {stt.ratio >= 0.8 ? " · GOOD!" : " · 천천히 또박또박 다시 해 볼까?"}
                  </div>
                )}
                <div className="row">
                  <button className="btn ghost" onClick={rec.reset}>다시 녹음</button>
                  <button className="btn ok big" disabled={saving || rec.recording.durationMs < 1000} onClick={saveRound}>{saving ? "저장 중…" : `${rounds + 1}회차 완료!`}</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="stack" style={{ alignItems: "center" }}>
            <PixelIcon name="trophy" size={48} />
            {status === "ready" ? (
              <>
                <b>{ROUNDS_REQUIRED}번 연습 완료! 이제 선생님께 검사를 받아요.</b>
                <div className="row">
                  <button className="btn big ok" onClick={requestCheck}><PixelIcon name="hand" size={20} /> 검사 요청하기</button>
                  {nextNo && <button className="btn secondary" onClick={() => nav(`${base}/${nextNo}`)}>다음 문장</button>}
                </div>
              </>
            ) : (
              <>
                <b>{rounds}회차 완료! {ROUNDS_REQUIRED - rounds}번 더 연습하면 검사받을 수 있어요.</b>
                <div className="row">
                  <button className="btn big" onClick={again}>한 번 더 연습</button>
                  {nextNo && <button className="btn secondary" onClick={() => nav(`${base}/${nextNo}`)}>다음 문장</button>}
                </div>
              </>
            )}
          </div>
        )}
        {!locked && status === "ready" && step === "type" && (
          <button className="btn ok" onClick={requestCheck}><PixelIcon name="hand" size={18} /> 바로 검사 요청하기 (연습 {rounds}회 완료)</button>
        )}
      </div>
    </div>
  );
}

function CustomSentenceForm({ student, program, base, setId, no, unit, task, prompt }: { student: StudentDoc; program: string; base: string; setId: string; no: number; unit: number; task: string; prompt?: string }) {
  const schoolId = useSchoolId();
  const [en, setEn] = useState("");
  const [ko, setKo] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="page narrow">
      <PageHeader back={base} icon="pen" title={<>#{no} 나만의 {unit}단원 표현</>} />
      <p className="muted small">{prompt ?? `${unit}단원에서 배운 표현을 골라 적어 보세요.`} 선생님이 검사할 때 확인해 주세요.</p>
      <div className="card stack">
        <label className="field"><span>영어 문장</span>
          <input className="input" value={en} onChange={(e) => setEn(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="예) I like soccer." />
        </label>
        <label className="field"><span>우리말 뜻</span>
          <input className="input" value={ko} onChange={(e) => setKo(e.target.value)} placeholder="예) 나는 축구를 좋아해." />
        </label>
        <button
          className="btn big"
          disabled={busy || en.trim().split(/\s+/).length < 2 || !ko.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await setDoc(doc(db, sp(schoolId, "englishItems"), itemId(student.year, student.sid, setId, no)), {
                sid: student.sid, year: student.year, grade: student.grade, classNo: student.classNo, program, setId, task, no,
                custom: { en: en.trim(), ko: ko.trim() }, rounds: [], status: "practicing", updatedAt: serverTimestamp(),
              });
            } catch (e) {
              toast("저장하지 못했어요: " + (e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          이 문장으로 연습 시작
        </button>
      </div>
    </div>
  );
}
