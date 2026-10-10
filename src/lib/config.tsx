import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { DEFAULT_CONFIG, mergeConfig, type AppConfig } from "../../shared/domain";

const Ctx = createContext<AppConfig>(DEFAULT_CONFIG);
export const useConfig = () => useContext(Ctx);

export function ConfigProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, "config", "app"),
      (snap) => setConfig(snap.exists() ? mergeConfig(snap.data() as Partial<AppConfig>) : DEFAULT_CONFIG),
      () => setConfig(DEFAULT_CONFIG),
    );
  }, [enabled]);
  return <Ctx.Provider value={config}>{children}</Ctx.Provider>;
}
