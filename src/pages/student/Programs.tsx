import { useNavigate, useParams } from "react-router-dom";
import { useConfig } from "../../lib/config";
import { useMySubmissions, useMyEnglishItems } from "../../lib/data";
import type { StudentDoc } from "../../lib/types";
import { activePrograms, programById, thresholdsFor, isCertified, MEDAL_LABEL } from "../../../shared/domain";
import { ProgramCard } from "../../components/ProgramCard";
import { PageHeader } from "../../components/Layout";
import { PixelIcon, PixelMedal } from "../../components/Pixel";
import { Empty } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { EvidenceForm } from "./EvidenceForm";
import { SentenceSetPage, useDingOnCheck } from "./SentenceSet";
import { SentencePractice } from "./SentencePractice";
import { Stamp } from "../../components/ui";

/** 홈: 내 도전 현황 (모든 학교 공통) */
export function StudentHome({ student }: { student: StudentDoc }) {
  const config = useConfig();
  const nav = useNavigate();
  const { rows } = useMySubmissions(student);
  const { rows: items } = useMyEnglishItems(student);
  const ding = useDingOnCheck(items);
  const programs = activePrograms(config, student.grade);
  const p = student.progress ?? {};
  const certified = programs.filter((x) => isCertified(p[x.id]?.medal));
  const pending = (rows ?? []).filter((r) => r.status === "pending").length;
  const recent = (rows ?? []).filter((r) => r.status !== "deleted").slice(0, 4);

  return (
    <div className="page">
      {ding.stamp && <Stamp title="DING DONG!" sub={ding.stamp} onDone={ding.clear} />}
      <div className="hud-banner px-card">
        <div>
          <div className="hud small">PLAYER</div>
          <h1 style={{ margin: 0 }}>{student.name}</h1>
          <div className="small">{student.grade}학년 {student.classNo}반 {student.number}번</div>
        </div>
        <div className="hud-stats">
          <div><span className="hud">CLEAR</span><b className="hud">{certified.length}/{programs.length}</b></div>
          <div><span className="hud">WAIT</span><b className="hud">{pending}</b></div>
          <div className="row" style={{ gap: 4 }}>{programs.map((x) => <PixelMedal key={x.id} medal={p[x.id]?.medal ?? "none"} size={28} withLabel={false} />)}</div>
        </div>
      </div>

      {student.feedback && (
        <div className="card flat row" style={{ marginTop: 14, alignItems: "flex-start", background: "var(--navy-50)" }}>
          <PixelIcon name="speech" size={28} />
          <div style={{ flex: 1 }}>
            <div className="small" style={{ fontWeight: 700 }}>선생님 한마디</div>
            <div style={{ whiteSpace: "pre-line" }}>{student.feedback}</div>
            <div className="tiny">— {student.feedbackByName}</div>
          </div>
        </div>
      )}

      <div className="grid grid-3" style={{ marginTop: 14 }}>
        {programs.map((x) => <ProgramCard key={x.id} program={x} progress={p[x.id] ?? { count: 0, medal: "none", thresholds: thresholdsFor(config, x, student.grade)! }} onClick={() => nav(`/do/${x.id}`)} />)}
      </div>

      <div className="section-title">최근 기록</div>
      <div className="stack">
        {recent.length === 0 && <Empty icon="flag">아직 올린 기록이 없어요. [인증하기]에서 첫 퀘스트를 시작해 볼까요?</Empty>}
        {recent.map((r) => {
          const def = programById(config, r.program);
          return (
            <div key={r.id} className="card flat row" style={{ alignItems: "flex-start" }}>
              <PixelIcon name={def?.icon ?? "star"} size={28} />
              <div style={{ flex: 1 }}>
                <div className="small"><b>{def?.name ?? r.program}</b> <span className="tiny">{r.activityDate ?? fmtDate(r.createdAt)}</span> {r.status === "pending" ? <span className="chip warn">확인 대기</span> : <span className="chip ok">인정</span>}</div>
                {r.status === "deleted" && r.deleteReason && <div className="small muted">선생님: {r.deleteReason}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 인증하기: 우리 학교 인증 항목 목록 (모든 학교 공통 틀) */
export function ProgramList({ student }: { student: StudentDoc }) {
  const config = useConfig();
  const nav = useNavigate();
  const programs = activePrograms(config, student.grade);
  const p = student.progress ?? {};
  return (
    <div className="page">
      <PageHeader icon="plus" title="인증하기" />
      <p className="small muted" style={{ marginTop: -4 }}>도전할 항목을 골라 사진·글·파일을 올려요. 선생님이 확인하면 횟수가 올라가요.</p>
      <div className="quest-list">
        {programs.map((x) => {
          const prog = p[x.id];
          const t = thresholdsFor(config, x, student.grade);
          return (
            <button key={x.id} className="card px-card quest-item" onClick={() => nav(`/do/${x.id}`)}>
              <span className="icon-box"><PixelIcon name={x.icon} size={36} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{x.name}</b>
                <span className="small muted ellipsis">{x.description}</span>
              </span>
              <span className="hud" style={{ textAlign: "right" }}>{prog?.count ?? 0}<span className="tiny"> / {t?.bronze ?? "-"}{x.kind === "tasks" ? "과제" : x.unit}</span></span>
              <PixelMedal medal={prog?.medal ?? "none"} size={36} withLabel={false} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 항목 화면: 증빙형 → 올리기 폼 / 과제형 → 과제 목록 */
export function ProgramPage({ student }: { student: StudentDoc }) {
  const { programId = "", taskId, no } = useParams();
  const config = useConfig();
  const nav = useNavigate();
  const program = programById(config, programId);
  if (!program || !program.enabled || !program.grades.includes(student.grade)) return <div className="page"><Empty icon="lock">우리 학년이 도전할 수 없는 항목이에요.</Empty></div>;
  const prog = student.progress?.[program.id];
  const t = thresholdsFor(config, program, student.grade)!;

  if (program.kind === "tasks" && taskId) {
    const task = program.tasks?.find((x) => x.id === taskId);
    if (!task) return <div className="page">과제를 찾을 수 없어요.</div>;
    if (task.kind === "sentences") return no ? <SentencePractice student={student} program={program} task={task} no={Number(no)} /> : <SentenceSetPage student={student} program={program} task={task} />;
    return (
      <div className="page narrow">
        <PageHeader back={`/do/${program.id}`} icon={program.icon} title={task.name} right={<span className="hud">{prog?.tasks?.[task.id] ?? 0} / {task.goal}</span>} />
        <p className="small muted" style={{ marginTop: -4 }}>{task.description}</p>
        <EvidenceForm student={student} program={program} task={task} backTo={`/do/${program.id}`} />
      </div>
    );
  }

  return (
    <div className="page narrow">
      <PageHeader back="/do" icon={program.icon} title={program.name} right={<span className="chip">{program.area} · {prog?.count ?? 0}{program.kind === "tasks" ? "과제" : program.unit} · 인증 {t.bronze}</span>} />
      <p className="small muted" style={{ marginTop: -4 }}>{program.description}</p>
      {program.kind === "tasks" ? (
        <div className="quest-list">
          {(program.tasks ?? []).map((task, i) => {
            const done = prog?.tasks?.[task.id] ?? 0;
            return (
              <button key={task.id} className="card px-card quest-item" onClick={() => nav(`/do/${program.id}/${task.id}`)}>
                <span className="icon-box hud" style={{ fontSize: "1.1rem" }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{task.name}</b>
                  <span className="small muted">{task.description}</span>
                  <span className="hp" style={{ display: "block", marginTop: 6 }}><span style={{ display: "block", height: "100%", width: `${(done / task.goal) * 100}%`, background: "repeating-linear-gradient(90deg,#63c74d 0 8px,#3e8948 8px 10px)" }} /></span>
                </span>
                <span className="hud">{done}/{task.goal}</span>
                {done >= task.goal ? <PixelIcon name="check" size={24} /> : <PixelIcon name="play" size={24} />}
              </button>
            );
          })}
          <div className="small muted">과제 {t.bronze}개 완료 = 인증 · {t.silver}개 = 은장 · {t.gold}개 = 금장</div>
        </div>
      ) : (
        <EvidenceForm student={student} program={program} backTo="/" />
      )}
    </div>
  );
}

/** 인증서 목록 */
export function CertificateList({ student }: { student: StudentDoc }) {
  const config = useConfig();
  const nav = useNavigate();
  const programs = activePrograms(config, student.grade);
  const p = student.progress ?? {};
  return (
    <div className="page">
      <PageHeader icon="trophy" title="내 인증서" />
      <div className="grid grid-3">
        {programs.map((x) => {
          const medal = p[x.id]?.medal ?? "none";
          const ok = isCertified(medal);
          return (
            <button key={x.id} className={`card px-card cert-tile ${ok ? "" : "locked"}`} disabled={!ok} onClick={() => nav(`/certs/${x.id}`)}>
              <PixelMedal medal={medal} size={64} />
              <b>{x.name}</b>
              <span className="small muted">{ok ? `${MEDAL_LABEL[medal]}장 달성 · 인증서 보기` : `인증까지 ${Math.max(0, (p[x.id]?.thresholds?.bronze ?? 0) - (p[x.id]?.count ?? 0))}${x.kind === "tasks" ? "과제" : x.unit} 남음`}</span>
              {!ok && <PixelIcon name="lock" size={20} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
