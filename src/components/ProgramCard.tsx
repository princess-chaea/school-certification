import type { ProgramConfig, ProgramProgress, MedalThresholds } from "../../shared/domain";
import { nextStep, MEDAL_LABEL, isCertified } from "../../shared/domain";
import { MedalBadge } from "./ui";

export function StepBar({ count, t }: { count: number; t: MedalThresholds }) {
  const max = t.gold;
  const pct = Math.min(100, (count / max) * 100);
  const marks: Array<[keyof MedalThresholds, string]> = [["bronze", "동·인증"], ["silver", "은"], ["gold", "금"]];
  return (
    <div className="steps" aria-label={`${count} / ${max}`}>
      <div className="fill" style={{ width: `${pct}%` }} />
      {marks.map(([k, label]) => (
        <div key={k} className={`mark ${count >= t[k] ? "reached" : ""}`} style={{ left: `${(t[k] / max) * 100}%` }}>
          <i />
          <span>
            {label} {t[k]}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ProgramCard({ program, progress, onClick }: { program: ProgramConfig; progress?: ProgramProgress; onClick?: () => void }) {
  if (!progress?.thresholds) return null;
  const { count, medal, thresholds } = progress;
  const next = nextStep(count, thresholds);
  return (
    <button className={`card program-card ${medal}-level ${medal === "gold" ? "sparkle" : ""}`} style={{ textAlign: "left", border: 0, cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div className="top">
        <span className="emoji">{program.emoji}</span>
        <div style={{ flex: 1 }}>
          <h3>{program.name}</h3>
          <div className="small muted">
            {program.area} · 지금까지 <b style={{ color: "var(--ink)" }}>{count}{program.unit}</b>
          </div>
        </div>
        <MedalBadge medal={medal} size="lg" />
      </div>
      <StepBar count={count} t={thresholds} />
      <div className="small">
        {next ? (
          next.medal === "bronze" ? (
            <>🎯 학교장 인증까지 <b>{next.remaining}{program.unit}</b> 남았어요!</>
          ) : (
            <>🎉 인증 완료! {MEDAL_LABEL[next.medal]}까지 {next.remaining}{program.unit} 더 도전해 볼까요?</>
          )
        ) : (
          <>🏆 금까지 모두 달성했어요. 정말 대단해요!</>
        )}
        {isCertified(medal) && <span className="chip ok" style={{ marginLeft: 6 }}>인증서 보기 가능</span>}
      </div>
    </button>
  );
}
