import { useEffect, useState } from "react";
import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../firebase";
import { sp, useSchoolId } from "../../lib/tenant";
import { useConfig } from "../../lib/config";
import { useSchool } from "../../lib/school";
import { useSession } from "../../lib/auth";
import { PageHeader } from "../../components/Layout";
import { PixelIcon } from "../../components/Pixel";
import { ICONS } from "../../components/pixelArt";
import { ICON_GROUPS } from "../../components/pixelArtActivities";
import { toast } from "../../components/ui";
import { EVIDENCE_LABEL, HAJU_PROGRAMS, type EvidenceKind, type ProgramDef } from "../../../shared/domain";
import { PROGRAM_TEMPLATES, type ProgramTemplate } from "../../../shared/templates";
import { GRADES } from "../../lib/classes";

const ENGLISH_TASKS: ProgramTemplate = { ...HAJU_PROGRAMS.find((p) => p.id === "english")!, id: "english-speak-up", templateId: "english-speak-up", source: "교육감" };
const ALL_TEMPLATES: ProgramTemplate[] = [ENGLISH_TASKS, ...PROGRAM_TEMPLATES];
const AREAS = [...new Set(ALL_TEMPLATES.map((t) => t.area))];
const EVIDENCE: EvidenceKind[] = ["photo", "text", "file", "audio", "link"];

/** 학교 담당자: 우리 학교 인증 항목 관리 (템플릿에서 추가 · 직접 만들기 · 기능 요청) */
export function ProgramsAdmin() {
  const schoolId = useSchoolId();
  const config = useConfig();
  const [programs, setPrograms] = useState<ProgramDef[]>(config.programs);
  const [editing, setEditing] = useState<ProgramDef | null>(null);
  const [gallery, setGallery] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!dirty) setPrograms(config.programs);
  }, [config.programs, dirty]);

  function change(next: ProgramDef[]) {
    setPrograms(next);
    setDirty(true);
  }
  function upsert(p: ProgramDef) {
    const i = programs.findIndex((x) => x.id === p.id);
    change(i >= 0 ? programs.map((x, j) => (j === i ? p : x)) : [...programs, p]);
    setEditing(null);
  }
  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= programs.length) return;
    const next = [...programs];
    [next[i], next[j]] = [next[j], next[i]];
    change(next);
  }
  function addTemplate(t: ProgramTemplate) {
    let id = t.id;
    let n = 2;
    while (programs.some((p) => p.id === id)) id = `${t.id}-${n++}`;
    const { source: _source, ...def } = t;
    void _source;
    setGallery(false);
    setEditing({ ...def, id, enabled: true });
  }
  async function save() {
    setBusy(true);
    try {
      await setDoc(doc(db, sp(schoolId, "config/app")), { programs, updatedAt: serverTimestamp() }, { merge: true });
      const r = await httpsCallable<unknown, { students: number }>(functions, "recomputeAll")({ schoolId });
      toast(`저장했어요. 학생 ${r.data.students}명의 진행률을 다시 계산했어요.`);
      setDirty(false);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (editing) return <ProgramEditor initial={editing} onCancel={() => setEditing(null)} onSave={upsert} existingIds={programs.map((p) => p.id)} />;

  return (
    <div className="page">
      <PageHeader icon="gamepad" title="인증 항목" right={<>
        <button className="btn secondary" onClick={() => setGallery(true)}><PixelIcon name="plus" size={16} /> 템플릿에서 추가</button>
        <button className="btn ghost" onClick={() => setEditing({ ...PROGRAM_TEMPLATES.find((t) => t.id === "my-own-challenge")!, id: `custom-${Date.now().toString(36)}`, name: "새 인증 항목", templateId: undefined })}>직접 만들기</button>
      </>} />
      <p className="small muted" style={{ marginTop: -4 }}>
        학생 화면의 [인증하기]에 이 순서대로 보여요. 화면 틀(탭)은 모든 학교가 같고, 항목만 학교마다 달라요. 기존 기록이 있는 항목은 지우기보다 [숨기기]를 권장해요.
      </p>
      <div className="quest-list">
        {programs.map((p, i) => (
          <div key={p.id} className={`card px-card quest-item ${p.enabled ? "" : "disabled-item"}`} style={{ cursor: "default" }}>
            <span className="icon-box"><PixelIcon name={p.icon} size={36} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{p.name} {!p.enabled && <span className="chip gray">숨김</span>}</b>
              <span className="small muted">
                {p.area} · {p.grades.length === 6 ? "전 학년" : `${p.grades.join("·")}학년`} · {p.kind === "tasks" ? `과제 ${p.tasks?.length ?? 0}개 중 ${p.tierTasks?.bronze ?? 1}개 = 인증` : `${p.evidence.map((e) => EVIDENCE_LABEL[e]).join("·")} · 인증 ${Object.values(p.targetByGrade)[0] ?? "-"}${p.unit}~`} · {p.approval === "teacher" ? "교사 승인" : "자동 인정"}
              </span>
            </span>
            <div className="row" style={{ gap: 4 }}>
              <button className="btn ghost sm" onClick={() => move(i, -1)} aria-label="위로">▲</button>
              <button className="btn ghost sm" onClick={() => move(i, 1)} aria-label="아래로">▼</button>
              <button className="btn ghost sm" onClick={() => change(programs.map((x) => (x.id === p.id ? { ...x, enabled: !x.enabled } : x)))}>{p.enabled ? "숨기기" : "보이기"}</button>
              <button className="btn secondary sm" onClick={() => setEditing(p)}>편집</button>
              <button className="btn ghost sm" onClick={() => confirm(`'${p.name}' 항목을 지울까요? 이미 올린 기록은 남지만 화면에서 보이지 않아요.`) && change(programs.filter((x) => x.id !== p.id))}>삭제</button>
            </div>
          </div>
        ))}
      </div>
      {dirty && (
        <div className="submit-bar">
          <button className="btn ghost" onClick={() => { setPrograms(config.programs); setDirty(false); }}>되돌리기</button>
          <button className="btn big" disabled={busy} onClick={save}>{busy ? "저장 중…" : "인증 항목 저장"}</button>
        </div>
      )}
      <FeatureRequest />
      {gallery && <TemplateGallery onPick={addTemplate} onClose={() => setGallery(false)} existing={programs.map((p) => p.templateId).filter(Boolean) as string[]} />}
    </div>
  );
}

function TemplateGallery({ onPick, onClose, existing }: { onPick: (t: ProgramTemplate) => void; onClose: () => void; existing: string[] }) {
  const [area, setArea] = useState<string>("all");
  const list = ALL_TEMPLATES.filter((t) => area === "all" || t.area === area);
  return (
    <div className="sheet-backdrop" onClick={onClose} style={{ alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card px-card" style={{ width: "min(960px, 100%)", maxHeight: "86dvh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="page-head">
          <PixelIcon name="star" size={28} />
          <h1>템플릿 고르기</h1>
          <div className="page-head-right"><button className="btn ghost sm" onClick={onClose}>닫기</button></div>
        </div>
        <p className="small muted" style={{ marginTop: -6 }}>교육감 인증제 항목과 2025 우수학교들이 공통으로 운영한 항목이에요. 고른 뒤 이름·기준을 우리 학교에 맞게 고칠 수 있어요.</p>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className={`choice ${area === "all" ? "on" : ""}`} onClick={() => setArea("all")}>전체</button>
          {AREAS.map((a) => <button key={a} className={`choice ${area === a ? "on" : ""}`} onClick={() => setArea(a)}>{a}</button>)}
        </div>
        <div className="grid grid-3">
          {list.map((t) => (
            <button key={t.id} className="card flat template-card" onClick={() => onPick(t)}>
              <div className="row" style={{ gap: 10 }}>
                <span className="icon-box"><PixelIcon name={t.icon} size={32} /></span>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <b>{t.name}</b>
                  <div className="tiny">{t.area} · {t.kind === "tasks" ? "과제형" : t.evidence.map((e) => EVIDENCE_LABEL[e]).join("·")}</div>
                </div>
              </div>
              <div className="small muted" style={{ textAlign: "left" }}>{t.description}</div>
              <div className="row" style={{ gap: 6 }}>
                <span className={`chip ${t.source === "교육감" ? "" : "gray"}`}>{t.source}</span>
                {existing.includes(t.templateId ?? t.id) && <span className="chip ok">사용 중</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProgramEditor({ initial, onCancel, onSave, existingIds }: { initial: ProgramDef; onCancel: () => void; onSave: (p: ProgramDef) => void; existingIds: string[] }) {
  const [p, setP] = useState<ProgramDef>(initial);
  const [iconPick, setIconPick] = useState(false);
  const set = (patch: Partial<ProgramDef>) => setP((x) => ({ ...x, ...patch }));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const isNew = !existingIds.includes(initial.id);
  const valid = p.name.trim() && p.grades.length && (p.kind === "tasks" || (p.evidence.length && p.required.every((r) => p.evidence.includes(r))));

  return (
    <div className="page narrow">
      <PageHeader icon={p.icon} title={isNew ? "인증 항목 추가" : "인증 항목 편집"} right={<button className="btn ghost sm" onClick={onCancel}>취소</button>} />
      <div className="card px-card stack">
        <div className="row">
          <button className="icon-box" style={{ width: 64, height: 64, cursor: "pointer" }} onClick={() => setIconPick((v) => !v)} aria-label="아이콘 바꾸기"><PixelIcon name={p.icon} size={44} /></button>
          <label className="field" style={{ flex: 1 }}><span>항목 이름 (인증서 '인증분야'에 표시)</span><input className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} /></label>
          <label className="field" style={{ width: 120 }}><span>영역</span><input className="input" value={p.area} onChange={(e) => set({ area: e.target.value })} /></label>
        </div>
        <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setIconPick((v) => !v)}>{iconPick ? "아이콘 고르기 닫기" : "아이콘 바꾸기"}</button>
        {iconPick && (
          <div className="stack" style={{ gap: 8 }}>
            {ICON_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="tiny" style={{ fontWeight: 700, marginBottom: 4 }}>{g.label}</div>
                <div className="icon-grid labeled">
                  {g.icons.filter(([n]) => ICONS[n]).map(([n, label]) => (
                    <button key={n} className={`icon-choice ${p.icon === n ? "on" : ""}`} onClick={() => { set({ icon: n }); setIconPick(false); }} title={label}>
                      <PixelIcon name={n} size={28} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <label className="field"><span>학생에게 보이는 설명</span><textarea className="input" value={p.description} onChange={(e) => set({ description: e.target.value })} /></label>
        <div className="field">
          <span style={{ fontWeight: 600 }}>대상 학년</span>
          <div className="row">{GRADES.map((g) => <button key={g} className={`choice ${p.grades.includes(g) ? "on" : ""}`} onClick={() => set({ grades: toggle(p.grades, g).sort() })}>{g}학년</button>)}</div>
        </div>
        {p.kind === "tasks" ? (
          <div className="stack" style={{ gap: 6 }}>
            <span style={{ fontWeight: 600 }}>과제 ({p.tasks?.length ?? 0}개)</span>
            {(p.tasks ?? []).map((t, i) => (
              <label key={t.id} className="row small" style={{ gap: 6 }}>
                <span className="hud">{i + 1}</span> {t.name} · 완료 기준
                <input className="input sm" type="number" min={1} style={{ width: 80 }} value={t.goal} onChange={(e) => set({ tasks: p.tasks!.map((x, j) => (j === i ? { ...x, goal: Math.max(1, Number(e.target.value) || 1) } : x)) })} />
                {t.kind === "sentences" ? "문장" : "건"}
              </label>
            ))}
            <div className="row small">
              인증(동장) = 과제 <input className="input sm" type="number" min={1} style={{ width: 60 }} value={p.tierTasks?.bronze ?? 1} onChange={(e) => set({ tierTasks: { ...(p.tierTasks ?? { bronze: 1, silver: 2, gold: 3 }), bronze: Number(e.target.value) || 1 } })} />개 ·
              은장 <input className="input sm" type="number" min={1} style={{ width: 60 }} value={p.tierTasks?.silver ?? 2} onChange={(e) => set({ tierTasks: { ...(p.tierTasks ?? { bronze: 1, silver: 2, gold: 3 }), silver: Number(e.target.value) || 2 } })} />개 ·
              금장 <input className="input sm" type="number" min={1} style={{ width: 60 }} value={p.tierTasks?.gold ?? 3} onChange={(e) => set({ tierTasks: { ...(p.tierTasks ?? { bronze: 1, silver: 2, gold: 3 }), gold: Number(e.target.value) || 3 } })} />개
            </div>
          </div>
        ) : (
          <>
            <div className="field">
              <span style={{ fontWeight: 600 }}>올릴 수 있는 증빙 (꼭 필요한 것은 [필수])</span>
              <div className="row">
                {EVIDENCE.map((e) => (
                  <span key={e} className="row" style={{ gap: 2 }}>
                    <button className={`choice ${p.evidence.includes(e) ? "on" : ""}`} onClick={() => set({ evidence: toggle(p.evidence, e), required: p.required.filter((r) => r !== e || !p.evidence.includes(e)) })}>{EVIDENCE_LABEL[e]}</button>
                    {p.evidence.includes(e) && <button className={`choice ${p.required.includes(e) ? "on" : ""}`} style={{ padding: "6px 8px" }} onClick={() => set({ required: toggle(p.required, e) })} title="필수">필수</button>}
                  </span>
                ))}
              </div>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span style={{ fontWeight: 600 }}>학년별 인증(동장) 기준</span>
              <div className="row" style={{ gap: 6 }}>
                {p.grades.map((g) => (
                  <label key={g} className="row small" style={{ gap: 4 }}>{g}학년
                    <input className="input sm" type="number" min={1} style={{ width: 70 }} value={p.targetByGrade[String(g)] ?? ""} onChange={(e) => set({ targetByGrade: { ...p.targetByGrade, [String(g)]: Math.max(1, Number(e.target.value) || 1) } })} />
                  </label>
                ))}
                <label className="row small" style={{ gap: 4 }}>단위 <input className="input sm" style={{ width: 70 }} value={p.unit} onChange={(e) => set({ unit: e.target.value })} /></label>
              </div>
            </div>
            <div className="field">
              <span style={{ fontWeight: 600 }}>추가 입력칸 (예: 책 제목)</span>
              {(p.fields ?? []).map((f, i) => (
                <div key={i} className="row">
                  <input className="input sm" style={{ flex: 1 }} value={f.label} onChange={(e) => set({ fields: p.fields!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={Boolean(f.required)} onChange={(e) => set({ fields: p.fields!.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)) })} />필수</label>
                  <button className="btn ghost sm" onClick={() => set({ fields: p.fields!.filter((_, j) => j !== i) })}>빼기</button>
                </div>
              ))}
              <div><button className="btn ghost sm" onClick={() => set({ fields: [...(p.fields ?? []), { key: `f${Date.now().toString(36)}`, label: "새 입력칸" }] })}>＋ 입력칸 추가</button></div>
            </div>
            <label className="field"><span>활동 종류 선택지 (쉼표로 구분, 비우면 없음)</span>
              <input className="input" value={(p.choices ?? []).join(", ")} onChange={(e) => set({ choices: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="분리수거, 플로깅, 텀블러" />
            </label>
            <div className="row">
              <label className="field" style={{ flex: 1 }}><span>소감 안내 문구</span><input className="input" value={p.textPrompt ?? ""} onChange={(e) => set({ textPrompt: e.target.value })} /></label>
              <label className="field" style={{ width: 140 }}><span>소감 최소 글자</span><input className="input" type="number" min={0} value={p.minTextLength ?? 0} onChange={(e) => set({ minTextLength: Number(e.target.value) || 0 })} /></label>
            </div>
            <div className="row">
              <label className="field" style={{ flex: 1 }}><span>외부 활동 사이트 링크 (선택)</span><input className="input" value={p.link ?? ""} onChange={(e) => set({ link: e.target.value.trim() || undefined })} placeholder="https://" /></label>
              {p.evidence.includes("audio") && <label className="field" style={{ width: 160 }}><span>최소 녹음 (초)</span><input className="input" type="number" min={0} value={p.minAudioSec ?? 0} onChange={(e) => set({ minAudioSec: Number(e.target.value) || undefined })} /></label>}
            </div>
          </>
        )}
        <div className="field">
          <span style={{ fontWeight: 600 }}>확인 방식</span>
          <div className="row">
            <button className={`choice ${p.approval === "teacher" ? "on" : ""}`} onClick={() => set({ approval: "teacher" })}>교사 승인 후 인정 (권장)</button>
            <button className={`choice ${p.approval === "auto" ? "on" : ""}`} onClick={() => set({ approval: "auto" })}>자동 인정 · 이상 기록만 교사가 제외</button>
          </div>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={p.aiReview !== false} onChange={(e) => set({ aiReview: e.target.checked })} /> AI가 사진·글을 1차로 보고 이상한 기록을 교사에게 표시</label>
        </div>
      </div>
      <div className="submit-bar">
        <button className="btn ghost" onClick={onCancel}>취소</button>
        <button className="btn big" disabled={!valid} onClick={() => onSave({ ...p, name: p.name.trim() })}>{isNew ? "항목 추가" : "적용"}</button>
      </div>
      <p className="tiny" style={{ textAlign: "right" }}>적용한 뒤 목록 화면에서 [인증 항목 저장]을 눌러야 학생 화면에 반영돼요.</p>
    </div>
  );
}

function FeatureRequest() {
  const s = useSession();
  const school = useSchool();
  const schoolId = useSchoolId();
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  if (s.kind !== "staff") return null;
  return (
    <div className="card px-card stack" style={{ marginTop: 20 }}>
      <b className="icon-text"><PixelIcon name="bell" size={22} /> 필요한 기능이 템플릿에 없나요?</b>
      <span className="small muted">예: "급식 사진에 식단표를 같이 보여 주고 싶어요", "줄넘기는 최고 기록으로 인증하고 싶어요". 시스템 관리자에게 전달돼요.</span>
      {sent ? <span className="chip ok">요청을 보냈어요. 만들어지면 템플릿에 추가돼요.</span> : (
        <>
          <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="만들고 싶은 인증 항목이나 기능을 적어 주세요." maxLength={2000} />
          <div><button className="btn" disabled={text.trim().length < 5} onClick={async () => {
            await addDoc(collection(db, "featureRequests"), { uid: s.user.uid, email: s.user.email, name: s.staff.name, schoolId, schoolName: school.name, text: text.trim(), status: "open", createdAt: serverTimestamp() });
            setSent(true);
          }}>기능 요청 보내기</button></div>
        </>
      )}
    </div>
  );
}
