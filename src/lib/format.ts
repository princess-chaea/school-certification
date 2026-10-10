import type { Timestamp } from "firebase/firestore";

export function toDate(t?: Timestamp | Date | null) {
  if (!t) return null;
  return t instanceof Date ? t : t.toDate();
}

export function fmtDate(t?: Timestamp | Date | null) {
  const d = toDate(t);
  if (!d) return "";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtDateTime(t?: Timestamp | Date | null) {
  const d = toDate(t);
  if (!d) return "";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtSec(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function studentLabel(s: { grade: number; classNo: number; number: number; name?: string }) {
  return `${s.grade}-${s.classNo} ${s.number}번 ${s.name || "(이름 없음)"}`;
}
