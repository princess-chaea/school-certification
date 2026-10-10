import { useParams } from "react-router-dom";
import { PageHeader } from "../../components/Layout";
import { useConfig } from "../../lib/config";
import type { StudentDoc } from "../../lib/types";
import { HwpxCertificate } from "../../components/HwpxCertificate";
import { isCertified, type ProgramId, MEDAL_LABEL } from "../../../shared/domain";

export function CertificatePage({ student }: { student: StudentDoc }) {
  const { program = "reading" } = useParams();
  const config = useConfig();
  const id = program as ProgramId;
  const medal = id === "english" ? student.progress?.english?.medal : student.progress?.[id as "reading" | "carbon"]?.medal;
  if (!config.programs[id]) return <div className="page">잘못된 주소예요.</div>;
  if (!isCertified(medal)) {
    return (
      <div className="page narrow">
        <PageHeader back="/" title="아직 인증 전이에요" />
        <p className="muted">{config.programs[id].name} 분야에서 동 단계(인증 기준)를 달성하면 인증서를 볼 수 있어요. 조금만 더 힘내요! 💪</p>
      </div>
    );
  }
  return (
    <div className="page narrow">
      <div className="no-print">
        <PageHeader
          back="/"
          title="🏅 내 인증서"
          right={<><span className="chip ok">{MEDAL_LABEL[medal!]} 단계 달성</span><button className="btn sm" onClick={() => window.print()}>🖨️ 인쇄·PDF 저장</button></>}
        />
      </div>
      <HwpxCertificate config={config} program={id} student={student} />
      <p className="tiny no-print" style={{ textAlign: "center" }}>※ 실제 인증서는 학교에서 시상식 때 드려요.</p>
    </div>
  );
}
