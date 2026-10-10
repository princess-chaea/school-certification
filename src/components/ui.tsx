import { useEffect, useState, type ReactNode } from "react";
import type { Medal } from "../../shared/domain";
import { fileUrl } from "../lib/media";
import { PixelIcon, PixelMedal } from "./Pixel";

export function MedalBadge({ medal, size }: { medal: Medal; size?: "lg" | number }) {
  return <PixelMedal medal={medal} size={size === "lg" ? 56 : typeof size === "number" ? size : 30} />;
}

export function Stamp({ title, sub, onDone }: { title: string; sub?: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="stamp-overlay" onClick={onDone}>
      <div className="stamp-pixel">
        <PixelIcon name="star" size={56} />
        <b className="hud">{title}</b>
        {sub && <span>{sub}</span>}
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

export function StorageImage({ path, icon = "camera", onOpen }: { path?: string; icon?: string; onOpen?: (url: string) => void }) {
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
      {!url && <PixelIcon name={icon} size={32} />}
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

export function StorageLink({ path, name }: { path?: string; name?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (path) fileUrl(path).then((u) => alive && setUrl(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [path]);
  if (!path) return null;
  return url ? (
    <a className="row small" href={url} target="_blank" rel="noreferrer" style={{ gap: 6 }}>
      <PixelIcon name="file" size={18} /> {name || "첨부 파일"}
    </a>
  ) : null;
}

export function Lightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  if (!url) return null;
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={url} alt="제출 사진" />
    </div>
  );
}

export function Empty({ children, icon = "sparkle" }: { children: ReactNode; icon?: string }) {
  return (
    <div className="card flat muted empty">
      <PixelIcon name={icon} size={40} />
      <div>{children}</div>
    </div>
  );
}

export function Loading({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <div className="page muted loading">
      <PixelIcon name="gamepad" size={48} className="bob" />
      <div className="hud">LOADING…</div>
      <div className="small">{label}</div>
    </div>
  );
}

/** 아이콘 + 글자 (제목 앞 장식용) */
export function IconText({ icon, children, size = 22 }: { icon: string; children: ReactNode; size?: number }) {
  return (
    <span className="icon-text">
      <PixelIcon name={icon} size={size} />
      <span>{children}</span>
    </span>
  );
}
