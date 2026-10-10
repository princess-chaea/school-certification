import { useEffect, useRef, useState } from "react";
import { pickAudioMime } from "./media";

export interface Recording {
  blob: Blob;
  url: string;
  durationMs: number;
  mime: string;
}

/** 마이크 녹음 훅 (MediaRecorder). maxMs 가 지나면 자동 정지 */
export function useRecorder(maxMs = 30_000) {
  const [state, setState] = useState<"idle" | "recording" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);

  const cleanup = () => {
    window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => () => cleanup(), []);

  async function start() {
    setError(null);
    try {
      const mime = pickAudioMime();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : undefined);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        const durationMs = Date.now() - startRef.current;
        const type = mr.mimeType || mime || "audio/webm";
        const blob = new Blob(chunks, { type });
        setRecording((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { blob, url: URL.createObjectURL(blob), durationMs, mime: type.split(";")[0] };
        });
        setState("done");
        cleanup();
      };
      mediaRef.current = mr;
      startRef.current = Date.now();
      setElapsed(0);
      mr.start(250);
      setState("recording");
      timerRef.current = window.setInterval(() => {
        const ms = Date.now() - startRef.current;
        setElapsed(ms);
        if (ms >= maxMs) stop();
      }, 200);
    } catch (e) {
      cleanup();
      setError((e as Error).name === "NotAllowedError" ? "마이크 사용을 허용해 주세요. (주소창 옆 자물쇠 → 권한)" : "녹음을 시작할 수 없어요.");
      setState("idle");
    }
  }

  function stop() {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
  }

  function reset() {
    if (recording) URL.revokeObjectURL(recording.url);
    setRecording(null);
    setState("idle");
    setElapsed(0);
  }

  return { state, elapsed, recording, error, start, stop, reset };
}
