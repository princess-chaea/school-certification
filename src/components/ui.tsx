import { useEffect, useState, type ReactNode } from "react";
import type { Medal } from "../../shared/domain";
import { MEDAL_LABEL } from "../../shared/domain";
import { fileUrl } from "../lib/media";

export function MedalBadge({ medal, size }: { medal: Medal; size?: "lg" }) {
  return (
    <span className={`medal ${medal} ${size ?? ""}`} title={MEDAL_LABEL[medal]}>
      {medal === "none" ? "·" : MEDAL_LABEL[medal]}
    </span>
  );
}

export function Stamp({ title, sub, onDone }: { title: string; sub?: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="stamp-overlay" onClick={onDone}>
      <div className="stamp">
        <div>
          <b>{title}</b>
          {sub && <span>{sub}</span>}
        </div>
      </div>
    </div>
  );
}

let toastSetter: ((s: string | null) => void) | null = null;
export function toast(msg: string) {
  toastSetter?.(msg);
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSetter = setMsg;
    return () => {
      toastSetter = null;
    };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export function StorageImage({ path, fallback = "🖼️", onOpen }: { path?: string; fallback?: string; onOpen?: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (path) fileUrl(path).then((u) => alive && setUrl(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [path]);
  return (
    <div className="thumb" style={url ? { backgroundImage: `url(${url})` } : undefined} onClick={() => url && onOpen?.(url)}>
      {!url && fallback}
    </div>
  );
}

export function StorageAudio({ path }: { path?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (path) fileUrl(path).then((u) => alive && setUrl(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [path]);
  if (!path) return null;
  return url ? <audio controls src={url} style={{ width: "100%", maxWidth: 320 }} /> : <span className="tiny">녹음 불러오는 중…</span>;
}

export function Lightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  if (!url) return null;
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={url} alt="제출 사진" />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card flat muted" style={{ textAlign: "center", padding: 28 }}>{children}</div>;
}

export function Loading({ label = "불러오는 중…" }: { label?: string }) {
  return <div className="page muted" style={{ textAlign: "center", paddingTop: 60 }}>{label}</div>;
}
