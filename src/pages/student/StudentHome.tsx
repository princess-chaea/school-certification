import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useConfig } from "../../lib/config";
import { useMySubmissions } from "../../lib/data";
import type { StudentDoc } from "../../lib/types";
import { ProgramCard } from "../../components/ProgramCard";
import { MedalBadge, toast } from "../../components/ui";
import { isCertified, englishProgress, MEDAL_LABEL, type ProgramId } from "../../../shared/domain";
import { fmtDate } from "../../lib/format";

export function StudentHome({ student }: { student: StudentDoc }) {
  const config = useConfig();
  const nav = useNavigate();
  const { rows } = useMySubmissions(student.sid);
  const p = student.progress ?? {};
  const showEnglish = config.programs.english.grades.includes(student.grade);
  const eng = englishProgress(config, p.english?.counts ?? { t1: 0, t2: 0, t3: 0, t4: 0 });
  const certified = (["reading", "carbon", "english"] as ProgramId[]).filter((id) => isCertified(id === "english" ? p.english?.medal : p[id]?.medal));
  const recent = (rows ?? []).filter((r) => r.status === "active").slice(0, 5);

  return (
    <div className="page">
      {!student.name && <NameForm sid={student.sid} />}
      <div className="row between">
        <h1>
          {student.name ? `${student.name}의 도전` : "나의 도전"} <span className="muted small">{student.grade}학년 {student.classNo}반 {student.number}번</span>
        </h1>
      </div>

      <div className="grid grid-3">
        <ProgramCard program={config.programs.reading} progress={p.reading} onClick={() => nav("/submit/reading")} />
        <ProgramCard program={config.programs.carbon} progress={p.carbon} onClick={() => nav("/submit/carbon")} />
        {showEnglish && (
          <button className={`card program-card ${eng.medal}-level ${eng.medal === "gold" ? "sparkle" : ""}`} style={{ textAlign: "left", border: 0, cursor: "pointer" }} onClick={() => nav("/english")}>
            <div className="top">
              <span className="emoji">{config.programs.english.emoji}</span>
              <div style={{ flex: 1 }}>
                <h3>{config.programs.english.name}</h3>
                <div className="small muted">외국어 · 과제 {eng.completed}개 완료</div>
              </div>
              <MedalBadge medal={eng.medal} size="lg" />
            </div>
            <div className="stack" style={{ marginTop: 12, gap: 8 }}>
              {eng.tasks.map((t) => (
                <div key={t.id} className="row small" style={{ gap: 8 }}>
                  <span style={{ width: 150, flex: "none" }}>{t.complete ? "✅" : "⬜"} {t.name}</span>
                  <div className="progress-bar" style={{ flex: 1 }}><div style={{ width: `${(t.done / t.goal) * 100}%` }} /></div>
                  <span className="tiny" style={{ width: 44, textAlign: "right" }}>{t.done}/{t.goal}</span>
                </div>
              ))}
            </div>
            <div className="small" style={{ marginTop: 10 }}>
              {eng.medal === "none" ? `🎯 과제 ${config.englishMedalTasks.bronze}개를 완료하면 인증이에요!` : `🎉 인증 완료! (${MEDAL_LABEL[eng.medal]})`}
            </div>
          </button>
        )}
      </div>

      <div className="section-title">기록 올리기</div>
      <div className="row">
        <Link className="btn big" to="/submit/reading">📚 독서기록 올리기</Link>
        <Link className="btn big" style={{ background: "var(--carbon)" }} to="/submit/carbon">🌏 탄소중립 실천 올리기</Link>
        {showEnglish && <Link className="btn big" style={{ background: "var(--english)" }} to="/english">🗣️ 영어 연습실</Link>}
      </div>

      {certified.length > 0 && (
        <>
          <div className="section-title">내 인증서</div>
          <div className="row">
            {certified.map((id) => (
              <Link key={id} className="btn secondary" to={`/cert/${id}`}>
                🏅 {config.programs[id].name}
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="section-title">최근 기록</div>
      <div className="stack">
        {recent.length === 0 && <div className="muted small">아직 올린 기록이 없어요. 첫 기록을 올려 볼까요?</div>}
        {recent.map((r) => (
          <div key={r.id} className="card flat row" style={{ alignItems: "flex-start" }}>
            <span style={{ fontSize: "1.5rem" }}>{config.programs[r.program].emoji}</span>
            <div style={{ flex: 1 }}>
              <div className="small">
                <b>{r.program === "reading" ? r.bookTitle || "독서기록" : r.program === "carbon" ? r.activityType || "탄소중립 실천" : r.task === "t4" ? `펀리딩: ${r.bookTitle ?? ""}` : "알공 완료"}</b>{" "}
                <span className="tiny">{fmtDate(r.createdAt)}</span>
              </div>
              {r.ai?.feedback && <div className="small muted">💬 {r.ai.feedback}</div>}
              {r.ai?.question && <div className="small" style={{ color: "var(--reading)" }}>🤔 {r.ai.question}</div>}
            </div>
          </div>
        ))}
        <Link to="/records" className="small">내 기록 전체 보기 →</Link>
      </div>
    </div>
  );
}

function NameForm({ sid }: { sid: string }) {
  const [name, setName] = useState("");
  return (
    <div className="card" style={{ marginBottom: 14, background: "var(--warn-50)" }}>
      <div className="row">
        <b>👋 처음 왔네요! 이름을 알려 주세요.</b>
        <input className="input" style={{ maxWidth: 200 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" />
        <button
          className="btn"
          disabled={!name.trim()}
          onClick={async () => {
            await updateDoc(doc(db, "students", sid), { name: name.trim() });
            toast("반가워요!");
          }}
        >
          저장
        </button>
      </div>
    </div>
  );
}
