export const CLASSES_PER_GRADE: Record<number, number> = { 1: 5, 2: 5, 3: 6, 4: 6, 5: 6, 6: 6 };
export const GRADES = [1, 2, 3, 4, 5, 6];
export function classesOf(grade: number) {
  return Array.from({ length: CLASSES_PER_GRADE[grade] ?? 0 }, (_, i) => i + 1);
}
