import { useParams } from "react-router-dom";
import { PageHeader } from "../../components/Layout";
import { useConfig } from "../../lib/config";
import type { StudentDoc } from "../../lib/types";
import { HwpxCertificate } from "../../components/HwpxCertificate";
import { isCertified, MEDAL_LABEL, programById } from "../../../shared/domain";
import { PixelIcon } from "../../components/Pixel";
import { Empty } from "../../components/ui";

export function CertificatePage({ student }: { student: StudentDoc }) {
  const { program = "" } = useParams();
  const config = useConfig();
  const def = programById(config, program);
  const medal = student.progress?.[program]?.medal;
  if (!def) return <div className="page">잘못된 주소예요.</div>;
  if (!isCertified(medal)) {
    return (
      <div className="page narrow">
        <PageHeader back="/certs" title="아직 인증 전이에요" />
        <Empty icon="lock">{def.name} 항목에서 동장(인증 기준)을 달성하면 인증서를 볼 수 있어요. 조금만 더 힘내요!</Empty>
      </div>
    );
  }
  return (
    <div className="page narrow">
      <div className="no-print">
        <PageHeader back="/certs" icon="trophy" title="내 인증서" right={<><span className="chip ok">{MEDAL_LABEL[medal!]}장 달성</span><button className="btn sm" onClick={() => window.print()}><PixelIcon name="download" size={16} /> 인쇄·PDF 저장</button></>} />
      </div>
      <HwpxCertificate config={config} program={program} student={student} />
      <p className="tiny no-print" style={{ textAlign: "center" }}>※ 실제 인증서는 학교에서 시상식 때 드려요.</p>
    </div>
  );
}
