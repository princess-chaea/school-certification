import { createContext, useContext } from "react";

/** 현재 로그인한 사람이 속한 학교 */
export const TenantCtx = createContext<string>("");
export const useSchoolId = () => useContext(TenantCtx);

/** schools/{schoolId}/... Firestore 경로 */
export const sp = (schoolId: string, path = "") => (path ? `schools/${schoolId}/${path}` : `schools/${schoolId}`);
