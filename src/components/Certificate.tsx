import type { AppConfig, Medal, ProgramId } from "../../shared/domain";
import { MedalBadge } from "./ui";

export function Certificate({ config, program, name, medal, background }: { config: AppConfig; program: ProgramId; name: string; medal: Medal; background?: string }) {
  const c = config.certificate;
  return (
    <div className={`cert-sheet ${background ? "custom-bg" : ""}`} style={background ? { backgroundImage: `url(${background})` } : undefined}>
      {!background && (
        <div className="cert-medal">
          <MedalBadge medal={medal} size="lg" />
        </div>
      )}
      <div className="cert-title">{c.title}</div>
      <div className="cert-meta">
        <div>
          인증분야:
          <br />
          {config.programs[program].name}
        </div>
        <div className="right">
          {c.schoolName}
          <br />
          {name || "(이름)"}
        </div>
      </div>
      <div className="cert-body">&nbsp;&nbsp;{c.body}</div>
      <div className="cert-date">{c.issueDate}</div>
      <div className="cert-principal">{c.principal}</div>
    </div>
  );
}
