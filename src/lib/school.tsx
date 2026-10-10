import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { DEFAULT_SCHOOL, mergeSchool, type SchoolInfo } from "../../shared/school";
import { sp } from "./tenant";

const Ctx = createContext<SchoolInfo>(DEFAULT_SCHOOL);
export const useSchool = () => useContext(Ctx);

/** 로그인한 학교의 정보 (이름·로고·학교장·학년도) */
export function SchoolProvider({ schoolId, children }: { schoolId: string; children: ReactNode }) {
  const [school, setSchool] = useState<SchoolInfo>(DEFAULT_SCHOOL);
  useEffect(
    () =>
      onSnapshot(
        doc(db, sp(schoolId)),
        (snap) => setSchool(mergeSchool(snap.exists() ? (snap.data() as Partial<SchoolInfo>) : null)),
        () => setSchool(DEFAULT_SCHOOL),
      ),
    [schoolId],
  );
  return <Ctx.Provider value={school}>{children}</Ctx.Provider>;
}
