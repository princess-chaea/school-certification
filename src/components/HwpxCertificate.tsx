import type { AppConfig, ProgramId } from "../../shared/domain";
import type { StudentDoc } from "../lib/types";

/** 학교 한글 양식(학교장 인증서.hwpx)과 같은 배치의 웹 인증서 */
export function HwpxCertificate({ config, program, student }: { config: AppConfig; program: ProgramId; student: Pick<StudentDoc, "grade" | "classNo" | "name"> }) {
  const c = config.certificate;
  const [y, m, d] = issueDateParts(c.issueDate);
  return (
    <div className="hwpx-cert">
      <img className="frame" src="/cert/frame.png" alt="" />
      <div className="inner">
        <div className="t">학교장&nbsp;&nbsp;인증서</div>
        <div className="meta">
          <div>
            인증분야:
            <br />
            {config.programs[program].name}
          </div>
          <div className="r">
            {c.schoolName}
            <br />
            {student.grade}학년 {student.classNo}반
            <br />
            {student.name || "(이름)"}
          </div>
        </div>
        <div className="body">&nbsp;&nbsp;{c.body}</div>
        <div className="date">{y}년 {m}월 {d}일</div>
        <div className="principal">
          {c.principal}
          {c.showSealOnWeb && <img className="seal" src="/cert/seal.jpg" alt="" />}
        </div>
      </div>
    </div>
  );
}

export function issueDateParts(text: string): [string, string, string] {
  const nums = text.match(/\d+/g) ?? [];
  return [nums[0] ?? "2026", nums[1] ?? "12", nums[2] ?? "0"];
}
