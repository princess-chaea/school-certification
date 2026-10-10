import type { CSSProperties, ReactElement } from "react";
import { iconRects } from "./pixelArt";
import type { Medal } from "../../shared/domain";

/** 레트로 픽셀 아이콘 */
export function PixelIcon({ name, size = 24, className, style, title, recolor }: { name: string; size?: number; className?: string; style?: CSSProperties; title?: string; recolor?: Record<string, string> }) {
  const rects = iconRects(name, recolor);
  return (
    <svg
      className={`px-icon ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}

const MEDAL_COLORS: Record<Medal, { rim: string; face: string; shine: string; deep: string; label: string }> = {
  bronze: { rim: "#733e39", face: "#c0763a", shine: "#e4a672", deep: "#8f4f2a", label: "동" },
  silver: { rim: "#5a6988", face: "#c0cbdc", shine: "#ffffff", deep: "#8b9bb4", label: "은" },
  gold: { rim: "#9e5b11", face: "#feae34", shine: "#fee761", deep: "#f77622", label: "금" },
  none: { rim: "#8b9bb4", face: "#e5e7eb", shine: "#f4f6f8", deep: "#c0cbdc", label: "" },
};

// 톱니 모양 메달 (20×20)
const MEDAL_MAP = [
  "......kk..kk......",
  "....kkRRkkRRkk....",
  "...kRRFFRRFFRRk...",
  "..kRFFSSFFFFFFRk..",
  ".kRFSSFFFFFFFFFRk.",
  ".kRFSFFFFFFFFFFRk.",
  "kRFFFFFFFFFFFFFFRk",
  "kRFSFFFFFFFFFFFFRk",
  ".kFFFFFFFFFFFFFFk.",
  ".kFFFFFFFFFFFFFFk.",
  "kRFFFFFFFFFFFFFDRk",
  "kRFFFFFFFFFFFFFDRk",
  ".kRFFFFFFFFFFFDRk.",
  ".kRFFFFFFFFFFDDRk.",
  "..kRFFFFFFFFDDRk..",
  "...kRRFFDDFFRRk...",
  "....kkRRkkRRkk....",
  "......kk..kk......",
];

/** 픽셀 메달 (동장·은장·금장) */
export function PixelMedal({ medal, size = 48, withLabel = true }: { medal: Medal; size?: number; withLabel?: boolean }) {
  const c = MEDAL_COLORS[medal];
  const fill: Record<string, string> = { k: "#1f2240", R: c.rim, F: c.face, S: c.shine, D: c.deep };
  return (
    <span className={`px-medal ${medal}`} style={{ width: size, height: size }} title={medal === "none" ? "도전 중" : `${c.label}장`}>
      <svg width={size} height={size} viewBox="0 0 18 18" shapeRendering="crispEdges" aria-hidden="true">
        {MEDAL_MAP.flatMap((row, y) => {
          const out: ReactElement[] = [];
          let x = 0;
          while (x < row.length) {
            const ch = row[x];
            if (ch === ".") { x++; continue; }
            let w = 1;
            while (x + w < row.length && row[x + w] === ch) w++;
            out.push(<rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} fill={fill[ch]} />);
            x += w;
          }
          return out;
        })}
      </svg>
      {withLabel && <b style={{ fontSize: Math.max(10, size * 0.3) }}>{medal === "none" ? "?" : c.label}</b>}
    </span>
  );
}
