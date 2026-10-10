import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions, googleProvider } from "../firebase";
import { parseStudentEmail } from "../../shared/domain";
import type { StaffDoc, StudentDoc } from "./types";

export type Session =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "student"; user: User; sid: string; student: StudentDoc | null; error?: string }
  | { kind: "staffNew"; user: User }
  | { kind: "staff"; user: User; staff: StaffDoc };

const Ctx = createContext<Session>({ kind: "loading" });
export const useSession = () => useContext(Ctx);

export async function login() {
  await signInWithPopup(auth, googleProvider);
}
export async function logout() {
  await signOut(auth);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ kind: "loading" });

  useEffect(() => {
    let unsubDoc: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubDoc?.();
      unsubDoc = undefined;
      if (!user) {
        setSession({ kind: "signedOut" });
        return;
      }
      const parsed = parseStudentEmail(user.email);
      if (parsed) {
        // 학생: 첫 로그인 등록 후 내 문서를 실시간 구독
        setSession({ kind: "student", user, sid: parsed.sid, student: null });
        httpsCallable(functions, "registerStudent")()
          .catch((e) => console.warn("registerStudent", e))
          .finally(() => {
            unsubDoc = onSnapshot(
              doc(db, "students", parsed.sid),
              (snap) => setSession({ kind: "student", user, sid: parsed.sid, student: snap.exists() ? (snap.data() as StudentDoc) : null }),
              (err) => setSession({ kind: "student", user, sid: parsed.sid, student: null, error: err.message }),
            );
          });
        return;
      }
      // 교사·관리자
      unsubDoc = onSnapshot(
        doc(db, "users", user.uid),
        (snap) => {
          if (!snap.exists()) setSession({ kind: "staffNew", user });
          else setSession({ kind: "staff", user, staff: { uid: user.uid, ...(snap.data() as Omit<StaffDoc, "uid">) } });
        },
        () => setSession({ kind: "staffNew", user }),
      );
    });
    return () => {
      unsubDoc?.();
      unsubAuth();
    };
  }, []);

  return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}
