import type { AppConfig, ProgramId } from "../../shared/domain";
import { programById } from "../../shared/domain";
import { principalTitle } from "../../shared/school";
import type { StudentDoc } from "../lib/types";
import { useSchool } from "../lib/school";

/**
 * 학교 한글 양식(학교장 인증서.hwpx)과 같은 배치의 웹 인증서
 * plain: 테두리 없는 판(상장 용지 인쇄용) · seal: 직인 표시 (학교장 이름 마지막 글자에 겹쳐 찍음)
 */
export function HwpxCertificate({ config, program, student, plain, seal, date }: { config: AppConfig; program: ProgramId; student: Pick<StudentDoc, "grade" | "classNo" | "name" | "progress">; plain?: boolean; seal?: boolean; date?: string }) {
  const school = useSchool();
  const c = config.certificate;
  // 수여일: 일괄 출력에서 정한 날짜 > 학생이 인증을 달성한 날 > 오늘
  const [y, m, d] = issueDateParts(date || student.progress?.[program]?.certifiedAt || todayIso());
  const title = principalTitle(school);
  const chars = [...title];
  const last = chars.pop() ?? "";
  const showSeal = (seal ?? c.showSealOnWeb) && Boolean(school.sealUrl);
  return (
    <div className={`hwpx-cert ${plain ? "plain" : ""}`}>
      {!plain && <img className="frame" src="/cert/frame.png" alt="" />}
      <div className="inner">
        <div className="t">학교장&nbsp;&nbsp;인증서</div>
        <div className="meta">
          <div>
            <span className="lbl">인증분야:</span>
            <br />
            {programById(config, program)?.name ?? program}
          </div>
          <div className="r">
            {school.name}
            <br />
            {student.grade}학년 {student.classNo}반
            <br />
            {student.name || "(이름)"}
          </div>
        </div>
        <div className="body">&nbsp;&nbsp;{c.body}</div>
        <div className="date">{y}년 {m}월 {d}일</div>
        <div className="principal">
          {chars.join("")}
          <span className="seal-anchor">
            {last}
            {showSeal && <img className="seal" src={school.sealUrl} alt="" style={{ width: `${((c.sealSizeMm || 24) / 210) * 100}cqw` }} />}
          </span>
        </div>
      </div>
    </div>
  );
}

/** "2026-12-18" 또는 "2026년 12월 18일" → ["2026", "12", "18"] (앞 0 없이) */
export function issueDateParts(text: string): [string, string, string] {
  const nums = (text.match(/\d+/g) ?? []).map((n) => String(Number(n)));
  const [ty, tm, td] = todayIso().split("-").map((n) => String(Number(n)));
  return [nums[0] ?? ty, nums[1] ?? tm, nums[2] ?? td];
}

/** 오늘 날짜 YYYY-MM-DD (한국 시간) */
export function todayIso() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}
