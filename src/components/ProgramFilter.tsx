import type { ProgramDef } from "../../shared/domain";
import { PixelIcon } from "./Pixel";

/** 인증 항목 필터: 아이콘 + 영역(인문·봉사…)으로 짧게. 영역이 겹치면 항목 이름. 고른 항목의 전체 이름은 아래 한 줄로 */
export function ProgramFilter({ programs, value, onChange, allLabel = "전체" }: { programs: ProgramDef[]; value: string | null; onChange: (id: string | null) => void; allLabel?: string | null }) {
  const areaCount = new Map<string, number>();
  programs.forEach((p) => areaCount.set(p.area, (areaCount.get(p.area) ?? 0) + 1));
  const label = (p: ProgramDef) => (p.area && areaCount.get(p.area) === 1 ? p.area : p.name);
  const picked = programs.find((p) => p.id === value);
  return (
    <div className="program-filter">
      <div className="program-filter-row">
        {allLabel !== null && <button className={`pf-chip ${value === null ? "on" : ""}`} onClick={() => onChange(null)}><PixelIcon name="star" size={20} /> {allLabel}</button>}
        {programs.map((p) => (
          <button key={p.id} className={`pf-chip ${value === p.id ? "on" : ""}`} title={p.name} aria-label={p.name} aria-pressed={value === p.id} onClick={() => onChange(p.id)}>
            <PixelIcon name={p.icon} size={20} /> <span>{label(p)}</span>
          </button>
        ))}
      </div>
      {picked && <div className="tiny pf-picked">{picked.name}</div>}
    </div>
  );
}
