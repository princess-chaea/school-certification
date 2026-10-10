// 앱(PWA) 설치 안내용 상태. beforeinstallprompt 는 로그인 전에 올 수 있어서 앱 시작 때 바로 받아 둔다.
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // 브라우저 기본 배너 대신 우리 팝업에서 설치
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export function onInstallChange(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}
export const canPromptInstall = () => deferred !== null;

/** 브라우저 설치 창 띄우기 (안드로이드 크롬·삼성 인터넷 등). 설치했으면 true */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  notify();
  return outcome === "accepted";
}

export function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export type Platform = "ios" | "inapp" | "samsung" | "android" | "desktop";
export function platform(): Platform {
  const ua = navigator.userAgent;
  if (/KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(ua)) return "inapp";
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/SamsungBrowser/.test(ua)) return "samsung";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}
