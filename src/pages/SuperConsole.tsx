import { useState } from "react";
import { doc, orderBy, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { useCollection } from "../lib/data";
import { fmtDateTime } from "../lib/format";
import { Empty, toast } from "../components/ui";
import { PixelIcon } from "../components/Pixel";
import type { NeisSchool } from "../../shared/school";
import type { Timestamp } from "firebase/firestore";
import { LogoutButton } from "../components/Modal";

interface SchoolRow {
  id: string;
  name: string;
  principalName?: string;
  joinPolicy?: string;
  status?: string;
  neis?: NeisSchool;
  createdAt?: Timestamp;
}
interface FeatureRequest {
  id: string;
  email: string;
  name: string;
  schoolId: string;
  schoolName: string;
  text: string;
  status: "open" | "doing" | "done";
  createdAt?: Timestamp;
}

const STATUS_LABEL = { open: "새 요청", doing: "만드는 중", done: "완료" } as const;

/** 시스템 관리자: 학교 목록 + 학교 담당자들의 기능 요청 */
export function SuperConsole({ onBack }: { onBack?: () => void }) {
  const [tab, setTab] = useState<"requests" | "schools">("requests");
  const [showDone, setShowDone] = useState(false);
  const { rows: requests } = useCollection<FeatureRequest>(
    "featureRequests",
    showDone ? [orderBy("createdAt", "desc")] : [where("status", "in", ["open", "doing"]), orderBy("createdAt", "desc")],
    [showDone],
  );
  const { rows: schools } = useCollection<SchoolRow>("schools", [], []);

  async function setStatus(id: string, status: FeatureRequest["status"]) {
    try {
      await updateDoc(doc(db, `featureRequests/${id}`), { status });
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <div className="page narrow">
      <div className="page-head" style={{ marginTop: 12 }}>
        {onBack && <button className="back-btn" onClick={onBack} aria-label="뒤로"><PixelIcon name="back" size={20} /></button>}
        <h1 className="row" style={{ gap: 10 }}><PixelIcon name="gear" size={30} /> 시스템 관리</h1>
        <div className="page-head-right"><LogoutButton /></div>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`choice ${tab === "requests" ? "on" : ""}`} onClick={() => setTab("requests")}><PixelIcon name="bell" size={18} /> 기능 요청</button>
        <button className={`choice ${tab === "schools" ? "on" : ""}`} onClick={() => setTab("schools")}><PixelIcon name="school" size={18} /> 학교 {schools ? `(${schools.length})` : ""}</button>
      </div>

      {tab === "requests" ? (
        <div className="stack">
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> 완료된 요청도 보기
          </label>
          {requests === null && <div className="muted">불러오는 중…</div>}
          {requests?.length === 0 && <Empty icon="bell">새 기능 요청이 없어요.</Empty>}
          {requests?.map((r) => (
            <div key={r.id} className="card stack">
              <div className="row between">
                <b>{r.schoolName}</b>
                <span className={`chip ${r.status === "done" ? "ok" : r.status === "doing" ? "warn" : "gray"}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{r.text}</div>
              <div className="tiny">{r.name} ({r.email}) · {fmtDateTime(r.createdAt)}</div>
              <div className="row">
                {(["open", "doing", "done"] as const).map((s) => (
                  <button key={s} className={`btn sm ${r.status === s ? "" : "ghost"}`} onClick={() => setStatus(r.id, s)}>{STATUS_LABEL[s]}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="stack">
          {schools === null && <div className="muted">불러오는 중…</div>}
          {schools?.length === 0 && <Empty icon="school">아직 개설된 학교가 없어요.</Empty>}
          {schools?.map((s) => (
            <div key={s.id} className="card row" style={{ gap: 12 }}>
              <PixelIcon name="school" size={30} />
              <span style={{ flex: 1 }}>
                <b>{s.name}</b> <span className="tiny">코드 {s.id}</span>
                <br />
                <span className="small muted">
                  {s.neis?.jurisdiction || s.neis?.atptName || "교육청 정보 없음"} · 학교장 {s.principalName || "미입력"} · {s.joinPolicy === "approval" ? "승인 후 사용" : "바로 사용"}
                </span>
              </span>
              <span className="tiny">{fmtDateTime(s.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
