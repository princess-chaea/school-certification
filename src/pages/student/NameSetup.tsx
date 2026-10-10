import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { sp, useSchoolId } from "../../lib/tenant";
import { useSchool } from "../../lib/school";
import { logout } from "../../lib/auth";
import { PixelIcon } from "../../components/Pixel";
import type { StudentDoc } from "../../lib/types";

/** 명단에 이름이 비어 있는 학생: 첫 로그인 때 한 번만 이름 입력 (이후 수정은 담임·학교 담당자) */
export function NameSetup({ student }: { student: StudentDoc }) {
  const schoolId = useSchoolId();
  const school = useSchool();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 20;

  async function save() {
    if (!valid) return;
    if (!confirm(`'${trimmed}' 맞나요? 한 번 정하면 내가 고칠 수 없고, 담임 선생님만 고칠 수 있어요.`)) return;
    setBusy(true);
    setErr(null);
    try {
      await updateDoc(doc(db, sp(schoolId, `students/${student.sid}`)), { name: trimmed, nameSetAt: serverTimestamp() });
    } catch {
      setErr("저장하지 못했어요. 다시 시도하거나 담임 선생님께 알려 주세요.");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="card stack" style={{ alignItems: "center", maxWidth: 420 }}>
        <PixelIcon name="hand" size={48} />
        <h1 style={{ margin: "6px 0 0", fontSize: "1.6rem" }}>내 이름을 알려 주세요</h1>
        <div className="muted">{school.name} {student.grade}학년 {student.classNo}반 {student.number}번</div>
        <input className="input" style={{ width: "100%", textAlign: "center", fontSize: "1.2rem" }} value={name} maxLength={20} autoFocus
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="이름 (예: 홍길동)" />
        <div className="tiny" style={{ lineHeight: 1.6 }}>
          인증서에 들어가는 이름이에요. 한 번 정하면 내가 고칠 수 없어요.
          <br />
          잘못 적었다면 담임 선생님께 고쳐 달라고 해요.
        </div>
        <button className="btn big" style={{ width: "100%" }} disabled={!valid || busy} onClick={save}>{busy ? "저장하는 중…" : "이름 정하기"}</button>
        {err && <div className="chip red">{err}</div>}
        <button className="btn ghost sm" onClick={() => logout()}>다른 계정으로 로그인</button>
      </div>
    </div>
  );
}
