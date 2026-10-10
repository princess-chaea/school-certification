import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { askConfirm } from "../components/Modal";
import { toast } from "../components/ui";

/** 학생 완전 삭제 (학교 담당자·그 반 담임): 확인 → 서버에서 기록·녹음·사진까지 삭제. 삭제했으면 true */
export async function deleteStudentFlow(schoolId: string, s: { sid?: string; id?: string; grade: number; classNo: number; number: number; name?: string }) {
  const sid = s.sid ?? s.id ?? "";
  const label = `${s.grade}학년 ${s.classNo}반 ${s.number}번 ${s.name || "(이름 입력 전)"}`;
  const ok = await askConfirm({
    title: "학생 삭제",
    message: `${label}\n명단에서 지우고, 이 학생이 올린 기록·사진·녹음과 인증 진행도 모두 삭제해요. 되돌릴 수 없어요.\n(전학 등으로 잠시 빼 두려면 '비활성'을 쓰세요.)`,
    ok: "삭제",
    danger: true,
  });
  if (!ok) return false;
  try {
    const r = await httpsCallable<unknown, { submissions: number; englishItems: number }>(functions, "deleteStudent")({ schoolId, sid });
    toast(`삭제했어요. (기록 ${r.data.submissions + r.data.englishItems}건 함께 삭제)`);
    return true;
  } catch (e) {
    toast("삭제하지 못했어요: " + (e as Error).message);
    return false;
  }
}
