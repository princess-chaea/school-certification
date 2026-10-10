import { useState } from "react";
import type { User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { logout, useRefreshSession } from "../lib/auth";
import { CLASSES_PER_GRADE } from "../lib/classes";
import type { StaffDoc } from "../lib/types";
import { PixelIcon } from "../components/Pixel";
import type { NeisSchool } from "../../shared/school";

type SchoolHit = NeisSchool & { opened?: boolean };
interface ProgramOption { id: string; name: string; icon: string; grades: number[] }
interface SchoolMeta { opened: boolean; joinPolicy: "open" | "approval"; programs: ProgramOption[] }

/**
 * 교사·학교 담당자 가입: ① 학교 찾기(NEIS) → ② 역할 (학교 담당자 / 담임 / 전담, 겹쳐서 선택)
 * 지금 버전은 학교 가입 방식이 '바로 사용'(기본)이라 신청하면 바로 들어가요. 없는 학교는 그 자리에서 개설돼요.
 */
export function TeacherSignup({ user, existing, isSuper, onSuper }: { user: User; existing?: StaffDoc; isSuper?: boolean; onSuper?: () => void }) {
  const refresh = useRefreshSession();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SchoolHit[] | null>(null);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(false);
  const [school, setSchool] = useState<SchoolHit | null>(null);
  const [meta, setMeta] = useState<SchoolMeta | null>(null);
  const [name, setName] = useState(existing?.name ?? user.displayName ?? "");
  const [admin, setAdmin] = useState(existing?.role === "admin" || Boolean(existing?.requestedAdmin));
  const [homeroom, setHomeroom] = useState(existing ? Boolean(existing.homeroom) : true);
  const [grade, setGrade] = useState(existing?.grade ?? 3);
  const [classNo, setClassNo] = useState(existing?.classNo ?? 1);
  const [subject, setSubject] = useState(Boolean(existing?.subject));
  const [grades, setGrades] = useState<number[]>(existing?.grades ?? []);
  const [programs, setPrograms] = useState<string[]>(existing?.programs ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const subjectOk = !subject || (grades.length > 0 && programs.length > 0);
  const valid = school && name.trim() && (admin || homeroom || subject) && subjectOk;
  const isNew = meta ? !meta.opened : !school?.opened;

  async function search() {
    setSearching(true);
    setSearchMsg(null);
    try {
      const res = await httpsCallable<{ query: string }, { schools: SchoolHit[]; message: string | null }>(functions, "searchSchools")({ query: q.trim() });
      setHits(res.data.schools);
      setSearchMsg(res.data.message);
    } catch (e) {
      setHits([]);
      setManual(true);
      setSearchMsg((e as Error).message || "검색하지 못했어요.");
    } finally {
      setSearching(false);
    }
  }

  async function pick(s: SchoolHit) {
    setSchool(s);
    setMeta(null);
    try {
      const res = await httpsCallable<{ schoolId: string }, SchoolMeta>(functions, "schoolPrograms")({ schoolId: s.schoolCode });
      setMeta(res.data);
      if (!res.data.opened) setAdmin(true); // 새 학교는 만든 사람이 학교 담당자
    } catch {
      setMeta({ opened: Boolean(s.opened), joinPolicy: "open", programs: [] });
    }
  }

  async function submit() {
    if (!school) return;
    setBusy(true);
    setErr(null);
    try {
      await httpsCallable(functions, "requestJoin")({
        neis: school,
        name: name.trim(),
        admin,
        homeroom: homeroom ? { grade, classNo } : null,
        subject: subject ? { grades, programs } : null,
      });
      refresh();
    } catch (e) {
      setErr("가입하지 못했어요: " + (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <div className="page-head" style={{ marginTop: 12 }}>
        <h1 className="row" style={{ gap: 10 }}><PixelIcon name="users" size={30} /> 선생님 가입</h1>
        <div className="page-head-right">
          {isSuper && <button className="btn sm" onClick={onSuper}><PixelIcon name="gear" size={18} /> 시스템</button>}
          <button className="btn ghost sm" onClick={() => logout()}>로그아웃</button>
        </div>
      </div>
      <p className="muted small">{user.email} · 학교를 고르고 맡은 역할을 모두 체크하세요. 처음 등록하는 학교면 그 자리에서 만들어지고, 만든 선생님이 학교 담당자가 돼요.</p>
      <div className="card flat small row" style={{ background: "var(--warn-50)", marginBottom: 12, gap: 10, flexWrap: "nowrap" }}>
        <PixelIcon name="alert" size={22} />
        <span><b>학생인가요?</b> 이 계정은 아직 학교 명단에 없어요. 담임 선생님께 명단 등록을 요청한 뒤 다시 로그인해 주세요.</span>
      </div>

      <div className="card stack">
        <b>① 학교 찾기</b>
        {!school ? (
          <>
            <div className="row">
              <input className="input" style={{ flex: 1, minWidth: 180 }} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.trim().length >= 2 && search()} placeholder="학교 이름 (예: 하주초등학교)" />
              <button className="btn" disabled={q.trim().length < 2 || searching} onClick={search}><PixelIcon name="search" size={18} /> {searching ? "찾는 중…" : "검색"}</button>
            </div>
            <div className="tiny">교육부 NEIS 학교 정보에서 찾아요.</div>
            {hits && (
              <div className="stack" style={{ gap: 8 }}>
                {hits.map((h) => (
                  <button key={h.schoolCode} className="school-result" onClick={() => pick(h)}>
                    <PixelIcon name="school" size={30} />
                    <span style={{ flex: 1 }}>
                      <b>{h.name}</b> <span className="tiny">{h.kind}</span>
                      <br />
                      <span className="small muted">{h.jurisdiction || h.atptName} · {h.address}</span>
                    </span>
                    {h.opened ? <span className="chip ok">사용 중</span> : <span className="chip gray">새 학교</span>}
                  </button>
                ))}
                {searchMsg && <div className="small muted">{searchMsg}</div>}
                {!manual && <button className="btn ghost sm" onClick={() => setManual(true)}>검색이 안 되나요? 직접 입력</button>}
              </div>
            )}
            {manual && <ManualSchool onPick={pick} />}
          </>
        ) : (
          <div className="school-result on" style={{ cursor: "default" }}>
            <PixelIcon name="school" size={30} />
            <span style={{ flex: 1 }}>
              <b>{school.name}</b>
              <br />
              <span className="small muted">{school.address || school.atptName || `학교코드 ${school.schoolCode}`}</span>
            </span>
            {meta && (isNew ? <span className="chip warn">새 학교 개설</span> : <span className="chip ok">사용 중</span>)}
            <button className="btn ghost sm" onClick={() => { setSchool(null); setMeta(null); }}>바꾸기</button>
          </div>
        )}
      </div>

      {school && (
        <div className="card stack" style={{ marginTop: 14 }}>
          <b>② 이름과 역할 <span className="tiny">(여러 개 고를 수 있어요)</span></b>
          <label className="field">
            <span>이름</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
          </label>

          <RoleBox icon="gear" title="학교 담당자" desc="학교 설정, 인증 항목 추가, 명단 등록, 구성원·인증서 관리" on={admin} locked={isNew} onToggle={() => setAdmin(!admin)} />

          <RoleBox icon="users" title="담임" desc="우리 반 학생의 모든 인증 기록 확인" on={homeroom} onToggle={() => setHomeroom(!homeroom)}>
            <div className="row">
              <select className="input" style={{ width: 120 }} value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setClassNo(1); }}>
                {[1, 2, 3, 4, 5, 6].map((g) => <option key={g} value={g}>{g}학년</option>)}
              </select>
              <select className="input" style={{ width: 120 }} value={classNo} onChange={(e) => setClassNo(Number(e.target.value))}>
                {Array.from({ length: Math.max(CLASSES_PER_GRADE[grade] ?? 6, 10) }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{c}반</option>)}
              </select>
            </div>
          </RoleBox>

          <RoleBox icon="check" title="전담 · 인증 업무 담당" desc="고른 학년의 고른 인증 항목 기록 확인" on={subject} onToggle={() => setSubject(!subject)}>
            <div className="field">
              <span className="small" style={{ fontWeight: 700 }}>담당 학년</span>
              <div className="row">
                {[1, 2, 3, 4, 5, 6].map((g) => <button key={g} className={`choice ${grades.includes(g) ? "on" : ""}`} onClick={() => setGrades(toggle(grades, g))}>{g}학년</button>)}
              </div>
            </div>
            <div className="field">
              <span className="small" style={{ fontWeight: 700 }}>담당 인증 항목</span>
              {meta === null ? (
                <span className="tiny">불러오는 중…</span>
              ) : meta.programs.length === 0 ? (
                <span className="tiny">아직 인증 항목이 없어요. 학교 담당자가 항목을 만든 뒤 [내 역할]에서 고를 수 있어요.</span>
              ) : (
                <div className="row">
                  {meta.programs.map((p) => (
                    <button key={p.id} className={`choice ${programs.includes(p.id) ? "on" : ""}`} onClick={() => setPrograms(toggle(programs, p.id))}>
                      <PixelIcon name={p.icon} size={18} /> {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </RoleBox>

          {meta?.joinPolicy === "approval" && !isNew && <div className="small muted">이 학교는 학교 담당자 승인 후 사용할 수 있어요.</div>}
          {err && <div className="chip red">{err}</div>}
          <button className="btn big" disabled={!valid || busy} onClick={submit}>
            <PixelIcon name="play" size={20} /> {busy ? "들어가는 중…" : isNew ? "학교 만들고 시작하기" : "가입하고 시작하기"}
          </button>
        </div>
      )}
    </div>
  );
}

export function RoleBox({ icon, title, desc, on, locked, onToggle, children }: { icon: string; title: string; desc: string; on: boolean; locked?: boolean; onToggle: () => void; children?: React.ReactNode }) {
  return (
    <div className={`role-box ${on ? "on" : ""}`}>
      <button className="role-head" onClick={locked ? undefined : onToggle} aria-pressed={on} disabled={locked}>
        <span className="role-check" aria-hidden="true">{on && <PixelIcon name="check" size={16} />}</span>
        <PixelIcon name={icon} size={26} />
        <span style={{ flex: 1, textAlign: "left" }}>
          <b>{title}</b>
          <br />
          <span className="tiny">{locked ? "새 학교를 만드는 선생님은 학교 담당자가 돼요." : desc}</span>
        </span>
      </button>
      {on && children && <div className="role-body stack">{children}</div>}
    </div>
  );
}

function ManualSchool({ onPick }: { onPick: (s: SchoolHit) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  return (
    <div className="card flat stack">
      <div className="small muted">NEIS 표준학교코드(7자리)는 학교알리미·나이스에서 확인할 수 있어요.</div>
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

/** 학교 가입 방식이 '승인 후 사용'일 때만 보이는 대기 화면 */
export function PendingApproval({ staff, user, schoolName }: { staff: StaffDoc; user: User; schoolName: string }) {
  const [edit, setEdit] = useState(false);
  if (edit) return <TeacherSignup user={user} existing={staff} />;
  const what = [
    staff.requestedAdmin && "학교 담당자",
    staff.homeroom && `${staff.grade}학년 ${staff.classNo}반 담임`,
    staff.subject && `${staff.grades?.join("·")}학년 전담`,
  ].filter(Boolean).join(" · ");
  return (
    <Centered>
      <div className="login-mark" aria-hidden="true"><PixelIcon name="clock" size={64} /></div>
      <h1 style={{ margin: 0 }}>{staff.status === "rejected" ? "가입이 반려되었어요" : "승인을 기다리고 있어요"}</h1>
      <div className="muted">{schoolName} · {staff.name} 선생님 · {what}</div>
      <div className="small muted">학교 담당자가 승인하면 이 화면이 자동으로 바뀌어요.</div>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn secondary" onClick={() => setEdit(true)}>가입 정보 다시 신청</button>
        <button className="btn ghost" onClick={() => logout()}>로그아웃</button>
      </div>
    </Centered>
  );
}
