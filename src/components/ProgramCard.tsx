import type { ProgramDef, ProgramProgress, MedalThresholds, Medal } from "../../shared/domain";
import { nextStep, MEDAL_LABEL, isCertified } from "../../shared/domain";
import { PixelIcon, PixelMedal } from "./Pixel";

/** 게임 스테이지 맵: 동(인증)·은·금 3단계, 현재 위치에 플레이어 표시 */
export function StageMap({ count, t, unit }: { count: number; t: MedalThresholds; unit: string }) {
  const stages: Array<[Exclude<Medal, "none">, string]> = [["bronze", "STAGE 1"], ["silver", "STAGE 2"], ["gold", "STAGE 3"]];
  const pct = Math.min(100, (count / t.gold) * 100);
  const segs = 20;
  const filled = Math.round((pct / 100) * segs);
  return (
    <div className="stage-map" aria-label={`${count}${unit} / 금 ${t.gold}${unit}`}>
      <div className="stage-track">
        {Array.from({ length: segs }, (_, i) => <i key={i} className={i < filled ? "on" : ""} />)}
        <span className="player" style={{ left: `calc(${pct}% - 10px)` }}><PixelIcon name="star" size={20} /></span>
      </div>
      <div className="stage-nodes">
        {stages.map(([m, label]) => {
          const reached = count >= t[m];
          return (
            <div key={m} className={`stage-node ${reached ? "reached" : ""}`} style={{ left: `${(t[m] / t.gold) * 100}%` }}>
              {reached ? <PixelMedal medal={m} size={30} /> : <span className="lock"><PixelIcon name="lock" size={18} /></span>}
              <span className="hud tiny-hud">{label}</span>
              <span className="tiny">{MEDAL_LABEL[m]}{m === "bronze" ? "·인증" : ""} {t[m]}{unit}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProgramCard({ program, progress, onClick }: { program: ProgramDef; progress?: ProgramProgress; onClick?: () => void }) {
  if (!progress) return null;
  const { count, medal, thresholds } = progress;
  const next = nextStep(count, thresholds);
  const unit = program.kind === "tasks" ? "과제" : program.unit;
  return (
    <button className={`card px-card program-card ${medal}-level`} onClick={onClick} disabled={!onClick}>
      <div className="top">
        <span className="icon-box"><PixelIcon name={program.icon} size={36} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="chip gray">{program.area}</span>
          <h3>{program.name}</h3>
          <div className="small muted">
            지금까지 <b className="hud" style={{ color: "var(--ink)", fontSize: "1.05rem" }}>{count}</b>{unit}
          </div>
        </div>
        <PixelMedal medal={medal} size={56} />
      </div>
      {program.kind === "tasks" && progress.tasks && (
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
          {(program.tasks ?? []).map((task) => {
            const done = progress.tasks?.[task.id] ?? 0;
            return (
              <div key={task.id} className="row small" style={{ gap: 8 }}>
                <PixelIcon name={done >= task.goal ? "check" : "flag"} size={16} />
                <span style={{ width: 130, flex: "none" }}>{task.name}</span>
                <div className="hp" style={{ flex: 1 }}><div style={{ width: `${(done / task.goal) * 100}%` }} /></div>
                <span className="hud tiny-hud" style={{ width: 46, textAlign: "right" }}>{done}/{task.goal}</span>
              </div>
            );
          })}
        </div>
      )}
      <StageMap count={count} t={thresholds} unit={unit} />
      <div className="small quest">
        {next ? (
          next.medal === "bronze" ? (
            <>
              <PixelIcon name="flag" size={16} /> 학교장 인증까지 <b>{next.remaining}{unit}</b> 남았어요!
            </>
          ) : (
            <>
              <PixelIcon name="sparkle" size={16} /> 인증 완료! {MEDAL_LABEL[next.medal]}장까지 {next.remaining}{unit} 더 도전!
            </>
          )
        ) : (
          <>
            <PixelIcon name="trophy" size={16} /> ALL CLEAR! 금장까지 모두 달성했어요
          </>
        )}
        {isCertified(medal) && <span className="chip ok" style={{ marginLeft: 6 }}>인증서 발급</span>}
      </div>
    </button>
  );
}
