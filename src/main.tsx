import { StrictMode, useEffect, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";
import { IS_EMULATOR } from "./firebase";

if (IS_EMULATOR) import("./dev").then((m) => m.installDevHelpers());

const iconSheet = IS_EMULATOR && location.pathname === "/__icons";
createRoot(document.getElementById("root")!).render(
  iconSheet ? <IconSheetLazy /> :
(<StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>),
);

function IconSheetLazy() {
  const [C, setC] = useState<null | (() => ReactElement)>(null);
  useEffect(() => { import("./IconSheet").then((m) => setC(() => m.IconSheet)); }, []);
  return C ? <C /> : null;
}
