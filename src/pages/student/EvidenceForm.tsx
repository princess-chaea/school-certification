import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { sp, useSchoolId } from "../../lib/tenant";
import { useMySubmissions } from "../../lib/data";
import { analyzeAudio, imageHash, newId, resizeImage, uploadBlob } from "../../lib/media";
import { useRecorder } from "../../lib/useRecorder";
import { fmtSec } from "../../lib/format";
import type { StudentDoc } from "../../lib/types";
import type { EvidenceKind, ExtraField, ProgramDef, TaskDef } from "../../../shared/domain";
import { validateEvidence } from "../../../shared/domain";
import { Stamp, toast } from "../../components/ui";
import { PixelIcon } from "../../components/Pixel";
import { playFanfare } from "../../lib/sound";

interface Spec {
  evidence: EvidenceKind[];
  required: EvidenceKind[];
  fields?: ExtraField[];
  choices?: string[];
  textPrompt?: string;
  minTextLength?: number;
  minAudioSec?: number;
  link?: string;
}

interface Draft {
  key: string;
  file?: File; // 사진
  preview?: string;
  attachment?: File; // 파일
  date: string;
  text: string;
  link: string;
  choice: string;
  fields: Record<string, string>;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const emptyDraft = (date = today(), choice = ""): Draft => ({ key: newId(), date, text: "", link: "", choice, fields: {} });

/** 모든 학교·모든 항목 공통 인증 올리기 폼 (사진·글·파일·녹음·링크 + 추가 입력칸) */
export function EvidenceForm({ student, program, task, backTo }: { student: StudentDoc; program: ProgramDef; task?: TaskDef; backTo: string }) {
  const schoolId = useSchoolId();
  const nav = useNavigate();
  const { rows } = useMySubmissions(student);
  const spec: Spec = task
    ? { evidence: task.evidence ?? ["photo"], required: task.required ?? ["photo"], fields: task.fields, minAudioSec: task.minAudioSec, link: task.link }
    : program;
  const hasPhoto = spec.evidence.includes("photo");
  const hasAudio = spec.evidence.includes("audio");
  const multi = hasPhoto && !hasAudio && !spec.evidence.includes("file");
  const [drafts, setDrafts] = useState<Draft[]>([emptyDraft()]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [stamp, setStamp] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);
  const rec = useRecorder(hasAudio ? 8 * 60_000 : 30_000);
  const hashes = new Set((rows ?? []).filter((r) => r.status !== "deleted").map((r) => (r as { hash?: string }).hash).filter(Boolean));

  function pick(key: string, ref: React.RefObject<HTMLInputElement | null>) {
    target.current = key;
    ref.current?.click();
  }
  function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 20);
    if (!images.length) return;
    setDrafts((ds) => {
      const idx = Math.max(0, ds.findIndex((d) => d.key === target.current));
      const base = ds[idx];
      const next = [...ds];
      if (base.preview) URL.revokeObjectURL(base.preview);
      next[idx] = { ...base, file: images[0], preview: URL.createObjectURL(images[0]) };
      if (multi) next.splice(idx + 1, 0, ...images.slice(1).map((file) => ({ ...emptyDraft(base.date, base.choice), file, preview: URL.createObjectURL(file) })));
      return next.slice(0, 20);
    });
  }
  function update(key: string, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }
  function remove(key: string) {
    setDrafts((ds) => {
      const d = ds.find((x) => x.key === key);
      if (d?.preview) URL.revokeObjectURL(d.preview);
      const rest = ds.filter((x) => x.key !== key);
      return rest.length ? rest : [emptyDraft()];
    });
  }

  const problems = drafts.map((d) => {
    const err = validateEvidence(spec, {
      photo: Boolean(d.file), file: Boolean(d.attachment), audioSec: hasAudio ? Math.round((rec.recording?.durationMs ?? 0) / 1000) : undefined,
      link: d.link, text: d.text, fields: d.fields, choice: d.choice || undefined,
    });
    if (err) return err;
    if (!d.date || d.date > today()) return "활동 날짜를 확인해 주세요";
    return null;
  });
  const ready = problems.every((x) => !x);

  async function submit() {
    setBusy(true);
    let done = 0;
    let skipped = 0;
    try {
      for (const d of drafts) {
        setProgress(`${done + skipped + 1} / ${drafts.length} 올리는 중…`);
        const data: Record<string, unknown> = {
          sid: student.sid, year: student.year, grade: student.grade, classNo: student.classNo,
          program: program.id, ...(task ? { task: task.id } : {}),
          activityDate: d.date, fields: d.fields, status: "pending", source: "student", count: 1, createdAt: serverTimestamp(),
        };
        if (d.text.trim()) data.text = d.text.trim().slice(0, 2000);
        if (d.link.trim()) data.link = d.link.trim();
        if (d.choice) data.activityType = d.choice;
        if (d.file) {
          const blob = await resizeImage(d.file);
          const hash = await imageHash(blob);
          if (hashes.has(hash)) {
            skipped++;
            continue;
          }
          hashes.add(hash);
          const path = `schools/${schoolId}/uploads/${student.sid}/${program.id}/${newId()}.jpg`;
          await uploadBlob(path, blob, "image/jpeg");
          Object.assign(data, { photoPath: path, photoType: "image/jpeg", hash });
        }
        if (d.attachment) {
          if (d.attachment.size > 10 * 1024 * 1024) throw new Error("파일은 10MB까지 올릴 수 있어요.");
          const path = `schools/${schoolId}/uploads/${student.sid}/${program.id}/${newId()}-${d.attachment.name.replace(/[^\w.가-힣-]/g, "_")}`;
          await uploadBlob(path, d.attachment, d.attachment.type || "application/octet-stream");
          Object.assign(data, { filePath: path, fileName: d.attachment.name });
        }
        if (hasAudio && rec.recording) {
          const ext = rec.recording.mime.includes("mp4") ? "m4a" : rec.recording.mime.includes("ogg") ? "ogg" : "webm";
          const path = `schools/${schoolId}/uploads/${student.sid}/${program.id}/${newId()}.${ext}`;
          await uploadBlob(path, rec.recording.blob, rec.recording.mime);
          const check = await analyzeAudio(rec.recording.blob);
          Object.assign(data, { audioPath: path, durationSec: Math.round(rec.recording.durationMs / 1000), ...(check ? { audioCheck: check } : {}) });
        }
        await addDoc(collection(db, sp(schoolId, "submissions")), data);
        done++;
      }
      drafts.forEach((d) => d.preview && URL.revokeObjectURL(d.preview));
      setDrafts([emptyDraft()]);
      rec.reset();
      if (skipped) toast(`이미 올린 사진 ${skipped}장은 빼고 올렸어요.`);
      if (done) {
        playFanfare();
        setStamp(`${done}건 올림 · 선생님 확인을 기다려요`);
      }
    } catch (e) {
      toast("올리지 못했어요: " + (e as Error).message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <>
      {stamp && <Stamp title="QUEST CLEAR!" sub={stamp} onDone={() => { setStamp(null); nav(backTo); }} />}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
      <input ref={photoRef} type="file" accept="image/*" multiple={multi} hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
      <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f && target.current) update(target.current, { attachment: f }); e.target.value = ""; }} />
      {spec.link && (
        <a className="btn secondary" href={spec.link} target="_blank" rel="noreferrer" style={{ marginBottom: 12 }}>
          <PixelIcon name="link" size={18} /> 활동 사이트 열기
        </a>
      )}
      <div className="stack">
        {drafts.map((d, i) => (
          <div key={d.key} className={`card px-card submit-card ${hasPhoto ? "" : "no-photo"}`}>
            {hasPhoto && (
              <div className="photo-slot" style={d.preview ? { backgroundImage: `url(${d.preview})` } : undefined}>
                {!d.preview ? (
                  <div className="stack" style={{ alignItems: "stretch", width: "100%", padding: 12 }}>
                    <div style={{ display: "grid", placeItems: "center" }}><PixelIcon name={program.icon} size={44} /></div>
                    <button className="btn" onClick={() => pick(d.key, cameraRef)}><PixelIcon name="camera" size={18} /> 사진 찍기</button>
                    <button className="btn secondary" onClick={() => pick(d.key, photoRef)}><PixelIcon name="upload" size={18} /> 앨범{multi ? "(여러 장)" : ""}</button>
                  </div>
                ) : (
                  <button className="btn sm ghost photo-change" onClick={() => pick(d.key, photoRef)}>사진 바꾸기</button>
                )}
              </div>
            )}
            <div className="stack" style={{ gap: 10, minWidth: 0 }}>
              <div className="row between">
                <b className="small hud">{drafts.length > 1 ? `RECORD ${i + 1}` : "RECORD"}</b>
                {(drafts.length > 1 || d.file) && <button className="btn ghost sm" onClick={() => remove(d.key)}>빼기</button>}
              </div>
              <label className="field">
                <span className="icon-text"><PixelIcon name="calendar" size={18} /> 활동 날짜</span>
                <input className="input" type="date" value={d.date} max={today()} onChange={(e) => update(d.key, { date: e.target.value })} />
              </label>
              {(spec.fields ?? []).map((f) => (
                <label key={f.key} className="field">
                  <span className="icon-text"><PixelIcon name="pen" size={18} /> {f.label}{f.required ? "" : " (선택)"}</span>
                  <input className="input" value={d.fields[f.key] ?? ""} onChange={(e) => update(d.key, { fields: { ...d.fields, [f.key]: e.target.value } })} />
                </label>
              ))}
              {!!spec.choices?.length && (
                <div className="field">
                  <span className="icon-text" style={{ fontWeight: 600, fontSize: ".9rem" }}><PixelIcon name="star" size={18} /> 활동 종류</span>
                  <div className="row" style={{ gap: 6 }}>
                    {spec.choices.map((c) => (
                      <button key={c} className={`choice ${d.choice === c ? "on" : ""}`} style={{ padding: "6px 10px", fontSize: ".85rem" }} onClick={() => update(d.key, { choice: c })}>{c}</button>
                    ))}
                  </div>
                </div>
              )}
              {spec.evidence.includes("file") && (
                <div className="row">
                  <button className="btn secondary sm" onClick={() => pick(d.key, fileRef)}><PixelIcon name="file" size={18} /> 파일 고르기</button>
                  <span className="small muted">{d.attachment ? d.attachment.name : "hwp·pdf·영상 등 (10MB까지)"}</span>
                </div>
              )}
              {spec.evidence.includes("link") && (
                <label className="field">
                  <span className="icon-text"><PixelIcon name="link" size={18} /> 링크</span>
                  <input className="input" value={d.link} placeholder="https://" onChange={(e) => update(d.key, { link: e.target.value })} />
                </label>
              )}
              {spec.evidence.includes("text") && (
                <label className="field">
                  <span className="icon-text"><PixelIcon name="speech" size={18} /> {spec.required.includes("text") ? "소감" : "한 줄 느낌 (선택)"}</span>
                  <textarea className="input" style={{ minHeight: 70 }} maxLength={2000} placeholder={spec.textPrompt ?? "느낀 점을 짧게 적어요."} value={d.text} onChange={(e) => update(d.key, { text: e.target.value })} />
                </label>
              )}
              {problems[i] && (d.file || d.text || d.attachment) && <span className="tiny" style={{ color: "var(--warn)" }}>! {problems[i]}</span>}
            </div>
          </div>
        ))}
      </div>

      {hasAudio && (
        <div className="card px-card stack" style={{ alignItems: "center", marginTop: 14 }}>
          <span className="hud">REC {spec.minAudioSec ? `· ${Math.ceil(spec.minAudioSec / 60)}분 이상` : ""}</span>
          <button className={`rec-btn ${rec.state === "recording" ? "on" : ""}`} onClick={() => (rec.state === "recording" ? rec.stop() : rec.start())} aria-label="녹음">
            <PixelIcon name={rec.state === "recording" ? "close" : "mic"} size={44} recolor={rec.state === "recording" ? { r: "#ffffff" } : undefined} />
          </button>
          <div className="hud" style={{ fontSize: "1.6rem" }}>{fmtSec(rec.state === "recording" ? rec.elapsed : rec.recording?.durationMs ?? 0)}</div>
          {rec.state === "recording" && spec.minAudioSec && (
            <div className="hp" style={{ width: "100%" }}><div style={{ width: `${Math.min(100, (rec.elapsed / (spec.minAudioSec * 1000)) * 100)}%` }} /></div>
          )}
          {rec.error && <div className="chip red">{rec.error}</div>}
          {rec.recording && rec.state === "done" && (
            <>
              <audio controls src={rec.recording.url} style={{ width: "100%" }} />
              <button className="btn ghost sm" onClick={rec.reset}>다시 녹음</button>
            </>
          )}
        </div>
      )}

      <div className="submit-bar">
        {multi && drafts.length < 20 && (
          <button className="btn ghost" onClick={() => setDrafts((ds) => [...ds, emptyDraft(ds[ds.length - 1]?.date)])}><PixelIcon name="plus" size={18} /> 기록 하나 더</button>
        )}
        <button className="btn big ok" disabled={busy || !ready} onClick={submit}>
          {busy ? progress : drafts.length > 1 ? `${drafts.length}개 한꺼번에 올리기` : "인증 올리기"}
        </button>
      </div>
      <p className="tiny" style={{ textAlign: "right" }}>올린 기록은 선생님이 확인하면 횟수에 들어가요.</p>
    </>
  );
}
