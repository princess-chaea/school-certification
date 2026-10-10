import type { EnglishItem, SentenceItem } from "./types";

export const ROUNDS_REQUIRED = 3;

export { englishItemId as itemId } from "../../shared/roster";

/** 이 문장에서 지금 연습할 정답 (학생 작성 칸은 학생이 쓴 문장) */
export function targetOf(s: SentenceItem, item?: EnglishItem) {
  if (s.type === "student") return { en: item?.custom?.en ?? "", ko: item?.custom?.ko ?? "", alternatives: [] as string[] };
  return { en: s.en, ko: s.ko, alternatives: s.alternatives ?? [] };
}

/** retry 이후에는 1회만 더 하면 다시 검사 요청 가능 */
export function roundsNeeded(item?: EnglishItem) {
  if (!item) return ROUNDS_REQUIRED;
  const retryBonus = (item as EnglishItem & { retryCount?: number }).retryCount ?? 0;
  return ROUNDS_REQUIRED + retryBonus;
}

export function completedRounds(item?: EnglishItem) {
  return (item?.rounds ?? []).filter((r) => r.typedOk && r.audioPath).length;
}

export function statusLabel(status?: EnglishItem["status"]) {
  switch (status) {
    case "checked": return "✅ 통과";
    case "requested": return "⏳ 검사 대기";
    case "ready": return "🙋 검사 요청 가능";
    case "retry": return "↺ 다시 해 보기";
    case "practicing": return "연습 중";
    default: return "시작 전";
  }
}
