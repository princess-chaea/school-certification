import { ICONS } from "./components/pixelArt";
import { PixelIcon, PixelMedal } from "./components/Pixel";
export function IconSheet() {
  return (
    <div style={{ padding: 20, display: "flex", flexWrap: "wrap", gap: 16, background: "#fff" }}>
      {Object.keys(ICONS).map((n) => (
        <div key={n} style={{ width: 90, textAlign: "center", fontSize: 11 }}><PixelIcon name={n} size={48} /><div>{n}</div></div>
      ))}
      {(["none", "bronze", "silver", "gold"] as const).map((m) => <PixelMedal key={m} medal={m} size={64} />)}
    </div>
  );
}
