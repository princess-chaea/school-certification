import { StrictMode, useEffect, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { IS_EMULATOR } from "./firebase";

/** 앱 시작 (설정값 점검을 통과한 뒤 main.tsx 에서 불러옴) */
export function boot() {
  if (IS_EMULATOR) import("./dev").then((m) => m.installDevHelpers());
  // 오프라인 캐시(서비스 워커): 앱을 여는 순간 새 버전이 있으면 받아서 한 번 새로고침.
  // (쓰는 도중에는 검사하지 않음: 사진 찍고 돌아올 때 입력이 날아가지 않게)
  else import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true })).catch(() => undefined);
  const iconSheet = IS_EMULATOR && location.pathname === "/__icons";
  createRoot(document.getElementById("root")!).render(
  iconSheet ? <IconSheetLazy /> :
(<StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>),
  );
}

function IconSheetLazy() {
  const [C, setC] = useState<null | (() => ReactElement)>(null);
  useEffect(() => { import("./IconSheet").then((m) => setC(() => m.IconSheet)); }, []);
  return C ? <C /> : null;
}
