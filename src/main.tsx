import { createRoot } from "react-dom/client";
import "./styles.css";
import "./lib/install"; // 설치 가능 신호(beforeinstallprompt)를 로그인 전부터 받아 둠

// 배포 환경 변수(VITE_FIREBASE_*)가 빌드에 들어갔는지 먼저 확인한다.
// 빠졌으면 Firebase 가 시작하자마자 오류를 내고 빈 화면이 되므로, 대신 무엇이 빠졌는지 보여 준다.
const REQUIRED = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
} as Record<string, string | undefined>;

function problems(): string[] {
  if (import.meta.env.VITE_USE_EMULATORS === "1") return [];
  const out = Object.entries(REQUIRED).filter(([, v]) => !v?.trim()).map(([k]) => `${k}: 비어 있음`);
  const key = REQUIRED.VITE_FIREBASE_API_KEY?.trim();
  if (key && (!key.startsWith("AIza") || /["',\s]/.test(key))) out.push("VITE_FIREBASE_API_KEY: 형식이 달라요 (AIza 로 시작, 따옴표·쉼표·공백 없이)");
  return out;
}

function showError(lines: string[]) {
  const root = createRoot(document.getElementById("root")!);
  root.render(
    <div className="page narrow" style={{ paddingTop: 40 }}>
      <div className="card stack">
        <h1 style={{ margin: 0 }}>앱 설정을 확인해 주세요</h1>
        <div className="small muted">배포 환경 변수(Vercel → Settings → Environment Variables)가 빌드에 들어가지 않았어요. 값을 고친 뒤 <b>Redeploy</b> 해야 반영돼요.</div>
        <ul className="small" style={{ margin: 0 }}>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>
    </div>,
  );
}

const found = problems();
if (found.length) showError(found);
else import("./boot").then((m) => m.boot()).catch((e) => showError([`시작하지 못했어요: ${(e as Error).message}`]));
