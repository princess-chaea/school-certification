import { useState } from "react";
import type { User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { logout, useRefreshSession } from "../lib/auth";
import { CLASSES_PER_GRADE } from "../lib/classes";
import type { ProgramId, StaffDoc } from "../lib/types";
import { DEFAULT_CONFIG } from "../../shared/domain";
import type { NeisSchool } from "../../shared/school";

type SchoolHit = NeisSchool & { opened?: boolean };
const PROGRAMS = DEFAULT_CONFIG.programs;

/** 교사 가입: ① NEIS 학교 검색 → ② 담당 업무 → 신청 (개설된 학교: 학교 관리자 승인 / 새 학교: 운영자 승인 후 관리자) */
export function TeacherSignup({ user, existing, request, isSuper, onSuper }: { user: User; existing?: StaffDoc & { schoolName?: string }; request?: { schoolName: string }; isSuper?: boolean; onSuper?: () => void }) {
  const refresh = useRefreshSession();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SchoolHit[] | null>(null);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(false);
  const [school, setSchool] = useState<SchoolHit | null>(null);
  const [name, setName] = useState(existing?.name ?? user.displayName ?? "");
  const [type, setType] = useState<"homeroom" | "subject">(existing?.teacherType ?? "homeroom");
  const [grade, setGrade] = useState(existing?.grade ?? 3);
  const [classNo, setClassNo] = useState(existing?.classNo ?? 1);
  const [grades, setGrades] = useState<number[]>(existing?.grades ?? [4, 5, 6]);
  const [programs, setPrograms] = useState<ProgramId[]>(existing?.programs ?? ["english"]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(request ? "requested" : null);

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const valid = school && name.trim() && (type === "homeroom" || (grades.length && programs.length));

  async function search() {
    setSearching(true);
    setSearchMsg(null);
    try {
      const res = await httpsCallable<{ query: string }, { schools: SchoolHit[]; message: string | null }>(functions, "searchSchools")({ query: q.trim() });
      setHits(res.data.schools);
      setSearchMsg(res.data.message);
    } catch (e) {
      setHits([]);
      setSearchMsg((e as Error).message || "검색하지 못했어요.");
    } finally {
      setSearching(false);
    }
  }

  async function submit() {
    if (!school) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await httpsCallable<unknown, { status: string }>(functions, "requestJoin")({
        neis: school,
        name: name.trim(),
        teacherType: type,
        ...(type === "homeroom" ? { grade, classNo } : { grades, programs }),
      });
      setDone(res.data.status);
      refresh();
    } catch (e) {
      setErr("신청하지 못했어요: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done === "requested") {
    return (
      <Centered>
        <h1 style={{ margin: 0 }}>학교 개설을 신청했어요</h1>
        <div className="muted">{request?.schoolName ?? school?.name} · 플랫폼 운영자가 확인 후 승인하면, 신청한 선생님이 학교 관리자가 돼요.</div>
        <div className="row">
          <button className="btn secondary" onClick={() => refresh()}>새로고침</button>
          <button className="btn ghost" onClick={() => setDone(null)}>다른 학교로 다시 신청</button>
          <button className="btn ghost" onClick={() => logout()}>로그아웃</button>
        </div>
        {isSuper && <button className="btn" onClick={onSuper}>🛠️ 운영자 콘솔</button>}
      </Centered>
    );
  }

  return (
    <div className="page narrow">
      <div className="page-head" style={{ marginTop: 12 }}>
        <h1>👩‍🏫 선생님 가입</h1>
        <div className="page-head-right">
          {isSuper && <button className="btn sm" onClick={onSuper}>🛠️ 운영자 콘솔</button>}
          <button className="btn ghost sm" onClick={() => logout()}>로그아웃</button>
        </div>
      </div>
      <p className="muted small">{user.email} · 학교를 찾아 가입을 신청하면 그 학교 관리자가 승인해요. 아직 개설되지 않은 학교면 개설 신청이 돼요.</p>
      <div className="card flat small" style={{ background: "var(--warn-50)", marginBottom: 12 }}>
        🧒 <b>학생인가요?</b> 이 계정은 아직 학교 명단에 없어요. 담임 선생님께 명단 등록을 요청한 뒤 다시 로그인해 주세요.
      </div>

      <div className="card stack">
        <b>① 학교 찾기</b>
        {!school ? (
          <>
            <div className="row">
              <input className="input" style={{ flex: 1, minWidth: 180 }} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.trim().length >= 2 && search()} placeholder="학교 이름 (예: 하주초등학교)" />
              <button className="btn" disabled={q.trim().length < 2 || searching} onClick={search}>{searching ? "찾는 중…" : "🔎 검색"}</button>
            </div>
            <div className="tiny">교육부 NEIS 학교 정보에서 찾아요.</div>
            {hits && (
              <div className="stack" style={{ gap: 8 }}>
                {hits.map((h) => (
                  <button key={h.schoolCode} className="school-result" onClick={() => setSchool(h)}>
                    <span style={{ fontSize: "1.5rem" }}>🏫</span>
                    <span style={{ flex: 1 }}>
                      <b>{h.name}</b> <span className="tiny">{h.kind}</span>
                      <br />
                      <span className="small muted">{h.jurisdiction || h.atptName} · {h.address}</span>
                    </span>
                    {h.opened ? <span className="chip ok">사용 중</span> : <span className="chip gray">개설 신청</span>}
                  </button>
                ))}
                {searchMsg && <div className="small muted">{searchMsg}</div>}
                {!manual && <button className="btn ghost sm" onClick={() => setManual(true)}>검색이 안 되나요? 직접 입력</button>}
              </div>
            )}
            {manual && <ManualSchool onPick={setSchool} />}
          </>
        ) : (
          <div className="school-result on" style={{ cursor: "default" }}>
            <span style={{ fontSize: "1.5rem" }}>🏫</span>
            <span style={{ flex: 1 }}>
              <b>{school.name}</b>
              <br />
              <span className="small muted">{school.address || school.atptName}</span>
            </span>
            {school.opened ? <span className="chip ok">사용 중 → 가입 신청</span> : <span className="chip warn">새 학교 → 개설 신청</span>}
            <button className="btn ghost sm" onClick={() => setSchool(null)}>바꾸기</button>
          </div>
        )}
      </div>

      {school && (
        <div className="card stack" style={{ marginTop: 14 }}>
          <b>② 담당 업무</b>
          <label className="field">
            <span>이름</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
          </label>
          <div className="row">
            <button className={`choice ${type === "homeroom" ? "on" : ""}`} onClick={() => setType("homeroom")}>담임</button>
            <button className={`choice ${type === "subject" ? "on" : ""}`} onClick={() => setType("subject")}>전담·인증 업무 담당</button>
          </div>
          {type === "homeroom" ? (
            <div className="row">
              <select className="input" style={{ width: 120 }} value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setClassNo(1); }}>
                {[1, 2, 3, 4, 5, 6].map((g) => <option key={g} value={g}>{g}학년</option>)}
              </select>
              <select className="input" style={{ width: 120 }} value={classNo} onChange={(e) => setClassNo(Number(e.target.value))}>
                {Array.from({ length: Math.max(CLASSES_PER_GRADE[grade] ?? 6, 10) }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{c}반</option>)}
              </select>
              <span className="muted">담임</span>
            </div>
          ) : (
            <>
              <div className="field">
                <span style={{ fontWeight: 600 }}>담당 학년 (해당 학년 기록이 보여요)</span>
                <div className="row">
                  {[1, 2, 3, 4, 5, 6].map((g) => <button key={g} className={`choice ${grades.includes(g) ? "on" : ""}`} onClick={() => setGrades(toggle(grades, g))}>{g}학년</button>)}
                </div>
              </div>
              <div className="field">
                <span style={{ fontWeight: 600 }}>인증 담당 분야</span>
                <div className="row">
                  {(["reading", "carbon", "english"] as ProgramId[]).map((p) => (
                    <button key={p} className={`choice ${programs.includes(p) ? "on" : ""}`} onClick={() => setPrograms(toggle(programs, p))}>{PROGRAMS[p].emoji} {PROGRAMS[p].name}</button>
                  ))}
                </div>
              </div>
            </>
          )}
          {err && <div className="chip red">{err}</div>}
          <button className="btn big" disabled={!valid || busy} onClick={submit}>{school.opened ? "가입 신청" : "학교 개설 신청"}</button>
        </div>
      )}
    </div>
  );
}

function ManualSchool({ onPick }: { onPick: (s: SchoolHit) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  return (
    <div className="card flat stack">
      <div className="small muted">NEIS 표준학교코드(7자리)는 학교알리미·나이스에서 확인할 수 있어요. 운영자가 확인 후 승인해요.</div>
      <div className="row">
        <input className="input" style={{ flex: 2, minWidth: 160 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="학교 이름" />
        <input className="input" style={{ flex: 1, minWidth: 120 }} value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9A-Za-z]/g, ""))} placeholder="학교코드" />
        <button className="btn secondary" disabled={!name.trim() || code.length < 5} onClick={() => onPick({ name: name.trim(), schoolCode: code, atptCode: "", atptName: "", kind: "", region: "", jurisdiction: "", address: "" })}>선택</button>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="login">
      <div className="card stack" style={{ alignItems: "center", textAlign: "center" }}>{children}</div>
    </div>
  );
}

export function PendingApproval({ staff, user, schoolName }: { staff: StaffDoc; user: User; schoolName: string }) {
  const [edit, setEdit] = useState(false);
  if (edit) return <TeacherSignup user={user} existing={staff} />;
  const what = staff.teacherType === "homeroom" ? `${staff.grade}학년 ${staff.classNo}반 담임` : `${staff.grades?.join("·")}학년 ${staff.programs?.length ?? 0}개 분야 담당`;
  return (
    <Centered>
      <div className="login-mark" aria-hidden="true">⏳</div>
      <h1 style={{ margin: 0 }}>{staff.status === "rejected" ? "가입이 반려되었어요" : "승인을 기다리고 있어요"}</h1>
      <div className="muted">{schoolName} · {staff.name} 선생님 · {what}</div>
      <div className="small muted">학교 관리자가 승인하면 이 화면이 자동으로 바뀌어요. 새 학년도에는 담임 학급을 다시 확인해 주세요.</div>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn secondary" onClick={() => setEdit(true)}>가입 정보 다시 신청</button>
        <button className="btn ghost" onClick={() => logout()}>로그아웃</button>
      </div>
    </Centered>
  );
}
