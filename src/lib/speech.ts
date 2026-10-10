// 브라우저 내장 TTS(원어민 발음 듣기)와 음성인식(발음 스스로 점검) — 비용 없음

export function speak(text: string, rate = 0.85) {
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("en-US")) ?? window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("en"));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
  return true;
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function speechRecognitionSupported() {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** 한 번 듣고 인식된 문장을 돌려준다 (최대 8초) */
export function recognizeOnce(): Promise<string> {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return Promise.reject(new Error("이 기기는 음성인식을 지원하지 않아요."));
  return new Promise((resolve, reject) => {
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let text = "";
    const timer = setTimeout(() => rec.stop(), 8000);
    rec.onresult = (e) => {
      text = Array.from(e.results).map((r) => r[0].transcript).join(" ");
    };
    rec.onerror = (e) => {
      clearTimeout(timer);
      reject(new Error(e.error === "not-allowed" ? "마이크 권한을 허용해 주세요." : "잘 듣지 못했어요. 다시 해 볼까요?"));
    };
    rec.onend = () => {
      clearTimeout(timer);
      resolve(text);
    };
    rec.start();
  });
}
