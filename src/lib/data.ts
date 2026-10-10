import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, where, limit as qLimit, type QueryConstraint } from "firebase/firestore";
import { db } from "../firebase";
import type { EnglishItem, SentenceSet, Submission, StudentDoc } from "./types";
import task1 from "../../data/english/task1-cartoon.json";
import task3g4 from "../../data/english/task3-grade4.json";
import task3g5 from "../../data/english/task3-grade5.json";
import task3g6 from "../../data/english/task3-grade6.json";

export const BUNDLED_SETS: Record<string, SentenceSet> = {
  "task1-cartoon": task1 as SentenceSet,
  "task3-grade4": task3g4 as SentenceSet,
  "task3-grade5": task3g5 as SentenceSet,
  "task3-grade6": task3g6 as SentenceSet,
};

export function useCollection<T>(path: string | null, constraints: QueryConstraint[], deps: unknown[]) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setRows([]);
      return;
    }
    setRows(null);
    return onSnapshot(
      query(collection(db, path), ...constraints),
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
      (err) => {
        console.error(path, err);
        setError(err.message);
        setRows([]);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { rows, error };
}

export function useMySubmissions(sid: string) {
  return useCollection<Submission>("submissions", [where("sid", "==", sid), orderBy("createdAt", "desc")], [sid]);
}

export function useMyEnglishItems(sid: string) {
  return useCollection<EnglishItem>("englishItems", [where("sid", "==", sid)], [sid]);
}

/** Firestore 의 문장 세트(관리자가 수정 가능), 없으면 앱에 내장된 기본 세트 */
export function useSentenceSet(setId: string | undefined) {
  const [set, setSet] = useState<SentenceSet | null>(setId ? BUNDLED_SETS[setId] ?? null : null);
  useEffect(() => {
    if (!setId) return;
    return onSnapshot(
      doc(db, "sentenceSets", setId),
      (snap) => setSet(snap.exists() ? (snap.data() as SentenceSet) : BUNDLED_SETS[setId] ?? null),
      () => setSet(BUNDLED_SETS[setId] ?? null),
    );
  }, [setId]);
  return set;
}

export function useClassStudents(grade: number | null, classNo: number | null) {
  const cons: QueryConstraint[] = grade && classNo ? [where("grade", "==", grade), where("classNo", "==", classNo), orderBy("number")] : [];
  return useCollection<StudentDoc & { id: string }>(grade && classNo ? "students" : null, cons, [grade, classNo]);
}

export function useGradeStudents(grade: number | null) {
  return useCollection<StudentDoc & { id: string }>(grade ? "students" : null, grade ? [where("grade", "==", grade)] : [], [grade]);
}

export { qLimit };
