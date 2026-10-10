import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { useConfig } from "../../lib/config";
import { useMySubmissions } from "../../lib/data";
import { imageHash, newId, resizeImage, uploadBlob } from "../../lib/media";
import type { StudentDoc } from "../../lib/types";
import { toast, Stamp } from "../../components/ui";
import { playFanfare } from "../../lib/sound";
import { AudioSubmit } from "./AudioSubmit";

interface Draft {
  key: string;
  file: File;
  preview: string;
  bookTitle: string;
  activityType: string;
  text: string;
}

/** 독서·탄소중립·알공 사진 제출. 지난 기록도 한꺼번에 여러 장 올릴 수 있다 */
export function SubmitPage({ student }: { student: StudentDoc }) {
  const { kind = "reading" } = useParams();
  const config = useConfig();
  const nav = useNavigate();
  const { rows } = useMySubmissions(student.sid);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [stamp, setStamp] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const program = kind === "t2" || kind === "t4" ? "english" : (kind as "reading" | "carbon");
  const knownHashes = useMemo(() => new Set((rows ?? []).filter((r) => r.status === "active").map((r) => (r as { hash?: string }).hash).filter(Boolean)), [rows]);

  if (kind === "t4") return <AudioSubmit student={student} />;
  if (!["reading", "carbon", "t2"].includes(kind)) return <div className="page">잘못된 주소예요.</div>;
  if (program === "english" && !config.programs.english.grades.includes(student.grade)) return <div className="page">영어는 4~6학년 과제예요.</div>;

  const p = config.programs[program];
  const title = kind === "reading" ? "📚 독서기록 올리기" : kind === "carbon" ? "🌏 탄소중립 실천 올리기" : "🗣️ 알공 완료 화면 올리기";
  const activityTypes = config.programs.carbon.activityTypes ?? [];
  const multiple = kind !== "t2";

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 20)
      .map((file) => ({ key: newId(), file, preview: URL.createObjectURL(file), bookTitle: "", activityType: "", text: "" }));
    setDrafts((d) => (multiple ? [...d, ...next].slice(0, 20) : next.slice(0, 1)));
  }
  function update(key: string, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }
  const missing = drafts.some((d) => (kind === "carbon" ? !d.activityType || d.text.trim().length < 2 : false));

  async function submit() {
    setBusy(true);
    let done = 0;
    let skipped = 0;
    const seen = new Set(knownHashes);
    try {
      for (const d of drafts) {
        setProgress(`${done + skipped + 1} / ${drafts.length} 올리는 중…`);
        const blob = await resizeImage(d.file);
        const hash = await imageHash(blob);
        if (seen.has(hash)) {
          skipped++;
          continue;
        }
        seen.add(hash);
        const path = `uploads/${student.sid}/${program}/${newId()}.jpg`;
        await uploadBlob(path, blob, "image/jpeg");
        await addDoc(collection(db, "submissions"), {
          sid: student.sid,
          grade: student.grade,
          classNo: student.classNo,
          program,
          ...(program === "english" ? { task: "t2" } : {}),
          photoPath: path,
          photoType: "image/jpeg",
          hash,
          ...(kind === "reading" ? { bookTitle: d.bookTitle.trim() } : {}),
          ...(kind === "carbon" ? { activityType: d.activityType, text: d.text.trim() } : {}),
          status: "active",
          source: "student",
          count: 1,
          createdAt: serverTimestamp(),
        });
        done++;
      }
      drafts.forEach((d) => URL.revokeObjectURL(d.preview));
      setDrafts([]);
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
      {stamp && <Stamp title="참 잘했어요" sub={stamp} onDone={() => { setStamp(null); nav("/"); }} />}
      <Link to={program === "english" ? "/english" : "/"} className="small">← 돌아가기</Link>
      <h1>{title}</h1>
      <p className="muted small">
        {kind === "reading" && "독서기록장 한 쪽을 반듯하게 찍어 주세요. 예전에 쓴 기록도 한꺼번에 여러 장 올릴 수 있어요."}
        {kind === "carbon" && "내가 실천하는 모습이 잘 보이게 찍어 주세요. (얼굴보다는 손과 물건 위주로!) 예전 사진도 올릴 수 있어요."}
        {kind === "t2" && "알공 학습 완료(결과) 화면을 캡처해서 올려 주세요."}
      </p>

      <div className="row">
        <button className="btn big" onClick={() => cameraRef.current?.click()}>📷 사진 찍기</button>
        <button className="btn big secondary" onClick={() => fileRef.current?.click()}>🖼️ 앨범에서 고르기{multiple ? " (여러 장)" : ""}</button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={fileRef} type="file" accept="image/*" multiple={multiple} hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      <div className="stack" style={{ marginTop: 16 }}>
        {drafts.map((d, i) => (
          <div key={d.key} className="card flat sub-card">
            <div className="thumb" style={{ backgroundImage: `url(${d.preview})` }} />
            <div className="stack" style={{ gap: 8 }}>
              <div className="row between">
                <b className="small">{i + 1}번째 사진</b>
                <button className="btn ghost sm" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}>빼기</button>
              </div>
              {kind === "reading" && (
                <input className="input" placeholder="책 제목 (선택)" value={d.bookTitle} onChange={(e) => update(d.key, { bookTitle: e.target.value })} />
              )}
              {kind === "carbon" && (
                <>
                  <div className="row" style={{ gap: 6 }}>
                    {activityTypes.map((t) => (
                      <button key={t} className={`choice ${d.activityType === t ? "on" : ""}`} style={{ padding: "6px 10px", fontSize: ".85rem" }} onClick={() => update(d.key, { activityType: t })}>{t}</button>
                    ))}
                  </div>
                  <textarea className="input" placeholder="어떤 실천을 했나요? 느낀 점을 한두 문장으로 적어요." value={d.text} onChange={(e) => update(d.key, { text: e.target.value })} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {drafts.length > 0 && (
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn big ok" disabled={busy || missing} onClick={submit}>
            {busy ? progress : `${drafts.length}장 제출하기`}
          </button>
          {missing && <span className="small muted">활동 종류와 소감을 적어 주세요.</span>}
        </div>
      )}
    </div>
  );
}
