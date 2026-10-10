import { DEFAULT_SLOGAN } from "../../../shared/school";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, functions, storage } from "../../firebase";
import { sp, useSchoolId } from "../../lib/tenant";
import { useSchool } from "../../lib/school";
import { useConfig } from "../../lib/config";
import { resizeImage } from "../../lib/media";
import { PageHeader } from "../../components/Layout";
import { toast } from "../../components/ui";
import { PixelIcon, PixelMedal } from "../../components/Pixel";
import { HwpxCertificate } from "../../components/HwpxCertificate";
import { type AppConfig } from "../../../shared/domain";
import { classesOf, GRADES } from "../../lib/classes";
import { askConfirm } from "../../components/Modal";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card stack" style={{ marginBottom: 14 }}>
      <b>{title}</b>
      {children}
    </div>
  );
}

async function call<T = unknown>(name: string, data: Record<string, unknown>) {
  return (await httpsCallable<unknown, T>(functions, name)(data)).data;
}

export function Settings() {
  const schoolId = useSchoolId();
  const school = useSchool();
  const config = useConfig();
  const [cfg, setCfg] = useState<AppConfig>(config);
  const [principal, setPrincipal] = useState(school.principalName);
  const [domain, setDomain] = useState(school.studentDomain);
  const [slogan, setSlogan] = useState(school.slogan ?? "");
  const [joinPolicy, setJoinPolicy] = useState<"open" | "approval">(((school as { joinPolicy?: string }).joinPolicy as "open" | "approval") ?? "open");
  const [busy, setBusy] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const sealRef = useRef<HTMLInputElement>(null);
  useEffect(() => setCfg(config), [config]);
  useEffect(() => {
    setPrincipal(school.principalName);
    setDomain(school.studentDomain);
    setSlogan(school.slogan ?? "");
  }, [school.principalName, school.studentDomain, school.slogan]);

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label);
    try {
      const msg = await fn();
      toast(msg || "저장했어요.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function uploadAsset(kind: "logo" | "seal", f?: File) {
    if (!f) return;
    await run(kind, async () => {
      // 직인은 투명 배경이 살아 있도록 PNG로 (학교장 이름 위에 겹쳐 찍힘)
      const type = kind === "seal" ? "image/png" : "image/jpeg";
      const blob = await resizeImage(f, kind === "logo" ? 512 : 600, 0.92, type);
      const r = ref(storage, `schools/${schoolId}/assets/${kind}-${Date.now()}.${kind === "seal" ? "png" : "jpg"}`);
      await uploadBytes(r, blob, { contentType: type });
      const url = await getDownloadURL(r);
      await updateDoc(doc(db, sp(schoolId)), { [kind === "logo" ? "logoUrl" : "sealUrl"]: url, updatedAt: serverTimestamp() });
      return kind === "logo" ? "교표를 바꿨어요." : "직인을 바꿨어요.";
    });
  }

  const saveConfig = () => run("config", async () => {
    await setDoc(doc(db, sp(schoolId, "config/app")), { medalMultipliers: cfg.medalMultipliers, certificate: cfg.certificate, updatedAt: serverTimestamp() }, { merge: true });
    const r = await call<{ students: number }>("recomputeAll", { schoolId });
    return `저장하고 학생 ${r.students}명의 진행률을 다시 계산했어요.`;
  });

  return (
    <div className="page narrow">
      <PageHeader icon="gear" title="학교 설정" right={<span className="chip gray">학교코드 {schoolId}</span>} />

      <Section title="학교 정보">
        <div className="row">
          {school.logoUrl ? <img src={school.logoUrl} alt="교표" style={{ width: 72, height: 72, objectFit: "contain", borderRadius: 12, border: "1px solid var(--line)", background: "#fff" }} /> : <div className="thumb" style={{ width: 72, height: 72 }}><PixelIcon name="school" size={36} /></div>}
          <div className="stack" style={{ gap: 4 }}>
            <b>{school.name}</b>
            <span className="small muted">{(school as { neis?: { address?: string } }).neis?.address ?? ""}</span>
            <button className="btn secondary sm" disabled={busy === "logo"} onClick={() => logoRef.current?.click()}>교표 이미지 바꾸기</button>
            <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => uploadAsset("logo", e.target.files?.[0])} />
          </div>
        </div>
        <label className="field"><span>우리 학교 인증제 문구 (모든 화면 맨 위 큰 글씨 · 학생에게도 보여요)</span>
          <input className="input" value={slogan} maxLength={30} onChange={(e) => setSlogan(e.target.value)} placeholder={DEFAULT_SLOGAN} />
          <span className="tiny">비워 두면 “{DEFAULT_SLOGAN}”. 아랫줄에는 “{school.shortName} 학교장 인증제”가 붙어요.</span>
        </label>
        <label className="field"><span>학교장 성함 (인증서: “{school.name}장 {principal || "○○○"}”)</span>
          <input className="input" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="예: 홍길동" />
        </label>
        <div className="row">
          {school.sealUrl ? <img src={school.sealUrl} alt="직인" style={{ width: 56, height: 56, objectFit: "contain" }} /> : <span className="chip gray">직인 미등록</span>}
          <button className="btn secondary sm" disabled={busy === "seal"} onClick={() => sealRef.current?.click()}>{school.sealUrl ? "직인 바꾸기" : "직인 등록"}</button>
          {school.sealUrl && <button className="btn ghost sm" disabled={busy === "seal"} onClick={() => run("seal", async () => { await updateDoc(doc(db, sp(schoolId)), { sealUrl: "", updatedAt: serverTimestamp() }); return "직인을 지웠어요."; })}>직인 지우기</button>}
          <input ref={sealRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => uploadAsset("seal", e.target.files?.[0])} />
        </div>
        <div className="tiny">직인은 인증서의 학교장 이름 마지막 글자에 겹쳐서 크게 찍혀요. 배경이 투명한 PNG가 가장 깔끔해요. 크기는 아래 [인증서]에서 조절해요.</div>
        <label className="field"><span>학생 계정 도메인 (선택: CSV 이메일에 @이 없을 때 붙임)</span>
          <input className="input" value={domain} onChange={(e) => setDomain(e.target.value.trim())} placeholder="예: gmail.com 또는 학교 계정 도메인" />
        </label>
        <div className="field">
          <span style={{ fontWeight: 600 }}>교사·담당자 가입 방식</span>
          <div className="row">
            <button className={`choice ${joinPolicy === "open" ? "on" : ""}`} onClick={() => setJoinPolicy("open")}>가입 즉시 사용</button>
            <button className={`choice ${joinPolicy === "approval" ? "on" : ""}`} onClick={() => setJoinPolicy("approval")}>학교 담당자 승인 후 사용 (권장: 실제 학생 데이터 운영 시)</button>
          </div>
        </div>
        <div><button className="btn" disabled={busy === "school"} onClick={() => run("school", async () => { await updateDoc(doc(db, sp(schoolId)), { principalName: principal.trim(), studentDomain: domain, joinPolicy, slogan: slogan.trim(), updatedAt: serverTimestamp() }); })}>학교 정보 저장</button></div>
      </Section>

      <Section title="금·은·동 단계 (모든 증빙형 항목 공통)">
        <div className="stack small" style={{ gap: 8 }}>
          <span className="row" style={{ gap: 6 }}><PixelMedal medal="bronze" size={28} /> 동장 = 항목별 인증 기준(계획서)</span>
          <span className="row" style={{ gap: 6 }}><PixelMedal medal="silver" size={28} /> 은장 = 동 ×<input className="input sm" type="number" step={0.1} min={1} style={{ width: 70 }} value={cfg.medalMultipliers.silver} onChange={(e) => setCfg({ ...cfg, medalMultipliers: { ...cfg.medalMultipliers, silver: Number(e.target.value) || 1.5 } })} /></span>
          <span className="row" style={{ gap: 6 }}><PixelMedal medal="gold" size={28} /> 금장 = 동 ×<input className="input sm" type="number" step={0.1} min={1} style={{ width: 70 }} value={cfg.medalMultipliers.gold} onChange={(e) => setCfg({ ...cfg, medalMultipliers: { ...cfg.medalMultipliers, gold: Number(e.target.value) || 2 } })} /></span>
        </div>
        <span className="small muted">항목별 기준 횟수·증빙·확인 방식은 [인증 항목]에서 바꿔요.</span>
      </Section>

      <Section title="인증서">
        <span className="small muted">수여 날짜: 교사 확인으로 인증 조건이 채워진 날이 학생 인증서에 바로 들어가요. 상장 배부일로 맞춰 일괄 출력하려면 [인증서] 메뉴에서 날짜를 정해요.</span>
        <label className="field"><span>본문</span>
          <textarea className="input" value={cfg.certificate.body} onChange={(e) => setCfg({ ...cfg, certificate: { ...cfg.certificate, body: e.target.value } })} />
        </label>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={cfg.certificate.showSealOnWeb} onChange={(e) => setCfg({ ...cfg, certificate: { ...cfg.certificate, showSealOnWeb: e.target.checked } })} /> 학생 화면 인증서에 직인 표시</label>
        <label className="row small" style={{ gap: 8 }}>
          직인 크기
          <input type="range" min={14} max={36} step={1} value={cfg.certificate.sealSizeMm} onChange={(e) => setCfg({ ...cfg, certificate: { ...cfg.certificate, sealSizeMm: Number(e.target.value) } })} />
          <b>{cfg.certificate.sealSizeMm}mm</b>
        </label>
        <div className="cert-preview">
          <div className="tiny">미리보기 (저장 전 설정 반영)</div>
          <HwpxCertificate config={cfg} program={cfg.programs[0]?.id ?? ""} student={{ grade: 4, classNo: 1, name: "홍길동" }} seal />
        </div>
      </Section>

      <div className="submit-bar" style={{ marginBottom: 20 }}>
        <button className="btn big" disabled={busy === "config"} onClick={saveConfig}>{busy === "config" ? "저장 중…" : "단계·인증서 설정 저장"}</button>
      </div>

      <DataTools busy={busy} run={run} />
      <NewYear />
    </div>
  );
}

function DataTools({ busy, run }: { busy: string | null; run: (label: string, fn: () => Promise<string | void>) => Promise<void> }) {
  const schoolId = useSchoolId();
  const [g, setG] = useState(4);
  const [c, setC] = useState(1);
  return (
    <Section title="데이터 도구">
      <div className="row">
        <button className="btn secondary" disabled={!!busy} onClick={() => run("sets", async () => { const r = await call<{ written: string[] }>("seedSentenceSets", { schoolId, overwrite: false }); return r.written.length ? `영어 문장 세트 ${r.written.length}개를 올렸어요.` : "이미 올라가 있어요."; })}>영어 문장 세트 기본값 올리기</button>
        <button className="btn secondary" disabled={!!busy} onClick={() => run("recompute", async () => { const r = await call<{ students: number }>("recomputeAll", { schoolId }); return `학생 ${r.students}명 진행률을 다시 계산했어요.`; })}>진행률 다시 계산</button>
      </div>
      <div className="row small">
        <span>시연용 예시 학급 만들기 (가상 학생·기록, 실제 데이터와 구분)</span>
        <select className="input sm" value={g} onChange={(e) => { setG(Number(e.target.value)); setC(1); }}>{GRADES.map((x) => <option key={x} value={x}>{x}학년</option>)}</select>
        <select className="input sm" value={c} onChange={(e) => setC(Number(e.target.value))}>{classesOf(g).map((x) => <option key={x} value={x}>{x}반</option>)}</select>
        <button className="btn secondary sm" disabled={!!busy} onClick={() => run("demo", async () => { const r = await call<{ students: number }>("seedDemo", { schoolId, classes: [{ grade: g, classNo: c }] }); return `예시 학생 ${r.students}명을 만들었어요.`; })}>{busy === "demo" ? "만드는 중…" : "만들기"}</button>
        <button className="btn ghost sm" disabled={!!busy} onClick={async () => (await askConfirm({ title: "예시 데이터 지우기", message: "예시(더미) 학생과 기록을 모두 지울까요?", ok: "모두 지우기", danger: true })) && run("clear", async () => { const r = await call<{ deleted: number }>("clearDemo", { schoolId }); return `예시 데이터 ${r.deleted}건을 지웠어요.`; })}>예시 데이터 모두 지우기</button>
      </div>
    </Section>
  );
}

function NewYear() {
  const schoolId = useSchoolId();
  const school = useSchool();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const need = `${school.year} 마감`;
  return (
    <Section title={`새 학년도 시작 (${school.year} → ${school.year + 1})`}>
      <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
        <li>{school.year}학년도 명단과 최종 결과(금은동)를 학년도 보관함에 저장해요.</li>
        <li>제출 기록·사진·녹음은 지우지 않고 {school.year}학년도 기록으로 남아요.</li>
        <li>현재 학생 명단은 비워지고, 새 학년도 명단(CSV)을 다시 올려요.</li>
        <li>담임 선생님은 새 학급을 다시 선택하고 승인을 받아요.</li>
      </ul>
      <div className="row">
        <input className="input" style={{ maxWidth: 220 }} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={`"${need}" 입력`} />
        <button
          className="btn danger"
          disabled={confirmText !== need || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await call<{ archived: number; newYear: number }>("startNewYear", { schoolId, newYear: school.year + 1, confirm: confirmText });
              toast(`${r.archived}명을 보관하고 ${r.newYear}학년도를 시작했어요.`);
              setConfirmText("");
            } catch (e) {
              toast((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "처리 중…" : "새 학년도 시작"}
        </button>
      </div>
    </Section>
  );
}
