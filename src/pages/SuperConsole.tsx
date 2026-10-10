import { useState } from "react";
import { orderBy, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { useCollection } from "../lib/data";
import { logout } from "../lib/auth";
import { fmtDateTime } from "../lib/format";
import { Empty, toast } from "../components/ui";
import type { NeisSchool } from "../../shared/school";
import type { Timestamp } from "firebase/firestore";

interface SchoolRequest {
  id: string;
  schoolId: string;
  uid: string;
  email: string;
  neis: NeisSchool;
  staff: { name: string; teacherType: string; grade?: number; classNo?: number };
  status: string;
  createdAt?: Timestamp;
}

/** 플랫폼 운영자: 학교 개설 신청 승인 */
export function SuperConsole({ onBack }: { onBack?: () => void }) {
  const { rows } = useCollection<SchoolRequest>("schoolRequests", [where("status", "==", "pending"), orderBy("createdAt", "desc")], []);
  const [busy, setBusy] = useState<string | null>(null);
  async function decide(id: string, approve: boolean) {
    setBusy(id);
    try {
      await httpsCallable(functions, "approveSchoolRequest")({ id, approve });
      toast(approve ? "학교를 개설했어요." : "반려했어요.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="page narrow">
      <div className="page-head" style={{ marginTop: 12 }}>
        {onBack && <button className="back-btn" onClick={onBack} aria-label="뒤로">←</button>}
        <h1>🛠️ 운영자 콘솔 · 학교 개설 신청</h1>
        <div className="page-head-right"><button className="btn ghost sm" onClick={() => logout()}>로그아웃</button></div>
      </div>
      <div className="stack">
        {rows === null && <div className="muted">불러오는 중…</div>}
        {rows?.length === 0 && <Empty>대기 중인 개설 신청이 없어요.</Empty>}
        {rows?.map((r) => (
          <div key={r.id} className="card stack">
            <div className="row between">
              <b>🏫 {r.neis.name}</b>
              <span className="tiny">{fmtDateTime(r.createdAt)}</span>
            </div>
            <div className="small muted">
              코드 {r.schoolId} · {r.neis.jurisdiction || r.neis.atptName || "교육청 정보 없음(직접 입력)"} · {r.neis.address}
            </div>
            <div className="small">
              신청자: {r.staff.name} ({r.email}) · {r.staff.teacherType === "homeroom" ? `${r.staff.grade}-${r.staff.classNo} 담임` : "전담·업무 담당"}
            </div>
            <div className="row">
              <button className="btn ok" disabled={busy === r.id} onClick={() => decide(r.id, true)}>승인 (신청자 = 학교 관리자)</button>
              <button className="btn ghost" disabled={busy === r.id} onClick={() => decide(r.id, false)}>반려</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
