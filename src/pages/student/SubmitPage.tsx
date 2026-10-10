import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { sp, useSchoolId } from "../../lib/tenant";
import { db } from "../../firebase";
import { useConfig } from "../../lib/config";
import { useMySubmissions } from "../../lib/data";
import { imageHash, newId, resizeImage, uploadBlob } from "../../lib/media";
import type { StudentDoc } from "../../lib/types";
import { toast, Stamp } from "../../components/ui";
import { PageHeader } from "../../components/Layout";
import { playFanfare } from "../../lib/sound";
import { AudioSubmit } from "./AudioSubmit";

interface Draft {
  key: string;
  file?: File;
  preview?: string;
  date: string; // 활동 날짜 YYYY-MM-DD
  bookTitle: string;
  activityType: string;
  text: string;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const emptyDraft = (date = today()): Draft => ({ key: newId(), date, bookTitle: "", activityType: "", text: "" });

/** 독서·탄소중립·알공 사진 제출. 지난 기록도 사진마다 날짜를 적어 한꺼번에 올릴 수 있다 */
export function SubmitPage({ student }: { student: StudentDoc }) {
  const schoolId = useSchoolId();
  const { kind = "reading" } = useParams();
  const config = useConfig();
  const nav = useNavigate();
  const { rows } = useMySubmissions(student);
  const [drafts, setDrafts] = useState<Draft[]>([emptyDraft()]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [stamp, setStamp] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const targetKey = useRef<string | null>(null);

  const program = kind === "t2" || kind === "t4" ? "english" : (kind as "reading" | "carbon");
  const knownHashes = useMemo(() => new Set((rows ?? []).filter((r) => r.status === "active").map((r) => (r as { hash?: string }).hash).filter(Boolean)), [rows]);

  if (kind === "t4") return <AudioSubmit student={student} />;
  if (!["reading", "carbon", "t2"].includes(kind)) return <div className="page">잘못된 주소예요.</div>;
  if (program === "english" && !config.programs.english.grades.includes(student.grade)) return <div className="page">영어는 4~6학년 과제예요.</div>;

  const p = config.programs[program];
  const title = kind === "reading" ? "📚 독서기록 올리기" : kind === "carbon" ? "🌏 탄소중립 실천 올리기" : "🗣️ 알공 완료 화면 올리기";
  const activityTypes = config.programs.carbon.activityTypes ?? [];
  const multiple = kind !== "t2";
  const progressInfo = program !== "english" ? student.progress?.[program] : undefined;

  function pick(key: string, camera: boolean) {
    targetKey.current = key;
    (camera ? cameraRef : fileRef).current?.click();
  }

  /** 고른 사진을 지금 카드에 넣고, 여러 장이면 같은 날짜로 카드를 더 만든다 */
  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 20);
    setDrafts((ds) => {
      const idx = Math.max(0, ds.findIndex((d) => d.key === targetKey.current));
      const base = ds[idx] ?? emptyDraft();
      const next = [...ds];
      if (base.preview) URL.revokeObjectURL(base.preview);
      next[idx] = { ...base, file: images[0], preview: URL.createObjectURL(images[0]) };
      if (multiple) {
        const extra = images.slice(1).map((file) => ({ ...emptyDraft(base.date), activityType: base.activityType, file, preview: URL.createObjectURL(file) }));
        next.splice(idx + 1, 0, ...extra);
      }
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
    if (!d.file) return "사진을 넣어 주세요";
    if (!d.date) return "날짜를 골라 주세요";
    if (d.date > today()) return "오늘 이후 날짜는 고를 수 없어요";
    if (kind === "carbon" && !d.activityType) return "활동 종류를 골라 주세요";
    if (kind === "carbon" && d.text.trim().length < 2) return "소감을 적어 주세요";
    return null;
  });
  const ready = problems.every((x) => !x);

  async function submit() {
    setBusy(true);
    let done = 0;
    let skipped = 0;
    const seen = new Set(knownHashes);
    try {
      for (const d of drafts) {
        if (!d.file) continue;
        setProgress(`${done + skipped + 1} / ${drafts.length} 올리는 중…`);
        const blob = await resizeImage(d.file);
        const hash = await imageHash(blob);
        if (seen.has(hash)) {
          skipped++;
          continue;
        }
        seen.add(hash);
        const path = `schools/${schoolId}/uploads/${student.sid}/${program}/${newId()}.jpg`;
        await uploadBlob(path, blob, "image/jpeg");
        await addDoc(collection(db, sp(schoolId, "submissions")), {
          sid: student.sid,
          year: student.year,
          grade: student.grade,
          classNo: student.classNo,
          program,
          ...(program === "english" ? { task: "t2" } : {}),
          photoPath: path,
          photoType: "image/jpeg",
          hash,
          activityDate: d.date,
          ...(d.text.trim() ? { text: d.text.trim() } : {}),
          ...(kind === "reading" ? { bookTitle: d.bookTitle.trim() } : {}),
          ...(kind === "carbon" ? { activityType: d.activityType } : {}),
          status: "active",
          source: "student",
          count: 1,
          createdAt: serverTimestamp(),
        });
        done++;
      }
      drafts.forEach((d) => d.preview && URL.revokeObjectURL(d.preview));
      setDrafts([emptyDraft()]);
      if (skipped) toast(`이미 올린 사진 ${skipped}장은 빼고 올렸어요.`);
      if (done) {
        playFanfare();
        setStamp(`${done}${program === "english" ? "장" : p.unit ?? "건"} 완료!`);
      }
    } catch (e) {
      toast("올리지 못했어요: " + (e as Error).message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <div className="page narrow">
      {stamp && <Stamp title="참 잘했어요" sub={stamp} onDone={() => { setStamp(null); nav(program === "english" ? "/english" : "/"); }} />}
      <PageHeader
        back={program === "english" ? "/english" : undefined}
        title={title}
        right={progressInfo?.thresholds ? <span className="chip">지금까지 {progressInfo.count}{p.unit} · 인증 {progressInfo.thresholds.bronze}{p.unit}</span> : undefined}
      />
      <p className="muted small" style={{ marginTop: -4 }}>
        {kind === "reading" && "독서기록장 한 쪽을 반듯하게 찍어 주세요. 예전에 쓴 기록도 날짜를 적어서 올릴 수 있어요."}
        {kind === "carbon" && "내가 실천하는 모습이 잘 보이게 찍어 주세요. (얼굴보다는 손과 물건 위주로!) 예전 사진도 날짜를 적어서 올릴 수 있어요."}
        {kind === "t2" && "알공 학습 완료(결과) 화면을 캡처해서 올려 주세요."}
      </p>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={fileRef} type="file" accept="image/*" multiple={multiple} hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

      <div className="stack">
        {drafts.map((d, i) => (
          <div key={d.key} className="card submit-card">
            <div className="photo-slot" style={d.preview ? { backgroundImage: `url(${d.preview})` } : undefined}>
              {!d.preview ? (
                <div className="stack" style={{ alignItems: "stretch", width: "100%", padding: 12 }}>
                  <div style={{ fontSize: "2rem", textAlign: "center" }}>{p.emoji}</div>
                  <button className="btn" onClick={() => pick(d.key, true)}>📷 사진 찍기</button>
                  <button className="btn secondary" onClick={() => pick(d.key, false)}>🖼️ 앨범{multiple ? "(여러 장)" : ""}</button>
                </div>
              ) : (
                <button className="btn sm ghost photo-change" onClick={() => pick(d.key, false)}>사진 바꾸기</button>
              )}
            </div>
            <div className="stack" style={{ gap: 10, minWidth: 0 }}>
              <div className="row between">
                <b className="small">{drafts.length > 1 ? `${i + 1}번째 기록` : "기록 내용"}</b>
                {(drafts.length > 1 || d.file) && <button className="btn ghost sm" onClick={() => remove(d.key)}>빼기</button>}
              </div>
              <label className="field">
                <span>📅 활동 날짜</span>
                <input className="input" type="date" value={d.date} max={today()} onChange={(e) => update(d.key, { date: e.target.value })} />
              </label>
              {kind === "reading" && (
                <label className="field">
                  <span>📖 책 제목 (선택)</span>
                  <input className="input" placeholder="예) 마당을 나온 암탉" value={d.bookTitle} onChange={(e) => update(d.key, { bookTitle: e.target.value })} />
                </label>
              )}
              {kind === "carbon" && (
                <div className="field">
                  <span style={{ fontWeight: 600, fontSize: ".9rem" }}>♻️ 활동 종류</span>
                  <div className="row" style={{ gap: 6 }}>
                    {activityTypes.map((t) => (
                      <button key={t} className={`choice ${d.activityType === t ? "on" : ""}`} style={{ padding: "6px 10px", fontSize: ".85rem" }} onClick={() => update(d.key, { activityType: t })}>{t}</button>
                    ))}
                  </div>
                </div>
              )}
              {kind !== "t2" && (
                <label className="field">
                  <span>💬 {kind === "carbon" ? "간단한 소감" : "한 줄 느낌 (선택)"}</span>
                  <textarea
                    className="input"
                    style={{ minHeight: 70 }}
                    placeholder={kind === "carbon" ? "어떤 실천을 했나요? 느낀 점을 한두 문장으로 적어요." : "책을 읽고 기억에 남는 점을 짧게 적어도 좋아요."}
                    value={d.text}
                    maxLength={300}
                    onChange={(e) => update(d.key, { text: e.target.value })}
                  />
                </label>
              )}
              {problems[i] && d.file && <span className="tiny" style={{ color: "var(--warn)" }}>⚠️ {problems[i]}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="submit-bar">
        {multiple && drafts.length < 20 && (
          <button className="btn ghost" onClick={() => setDrafts((ds) => [...ds, emptyDraft(ds[ds.length - 1]?.date)])}>＋ 기록 하나 더</button>
        )}
        <button className="btn big ok" disabled={busy || !ready} onClick={submit}>
          {busy ? progress : drafts.length > 1 ? `${drafts.length}개 한꺼번에 제출` : "제출하기"}
        </button>
      </div>
    </div>
  );
}
