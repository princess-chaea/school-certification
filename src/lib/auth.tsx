import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions, googleProvider } from "../firebase";
import { sp } from "./tenant";
import type { StaffDoc, StudentDoc } from "./types";

interface WhoAmI {
  super: boolean;
  student?: { schoolId: string; sid: string };
  staff?: { schoolId: string; status: string; role: string };
  request?: { id: string; schoolName: string; schoolId: string };
}

export type Session =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "student"; user: User; schoolId: string; sid: string; student: StudentDoc | null; error?: string }
  | { kind: "staffNew"; user: User; isSuper: boolean; request?: WhoAmI["request"] }
  | { kind: "staff"; user: User; schoolId: string; staff: StaffDoc; isSuper: boolean };

const Ctx = createContext<{ session: Session; refresh: () => void }>({ session: { kind: "loading" }, refresh: () => undefined });
export const useSession = () => useContext(Ctx).session;
export const useRefreshSession = () => useContext(Ctx).refresh;

export async function login() {
  await signInWithPopup(auth, googleProvider);
}
export async function logout() {
  await signOut(auth);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ kind: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let unsubDoc: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubDoc?.();
      unsubDoc = undefined;
      if (!user) {
        setSession({ kind: "signedOut" });
        return;
      }
      setSession({ kind: "loading" });
      httpsCallable<unknown, WhoAmI>(functions, "whoami")()
        .then((r) => r.data)
        .catch((e) => {
          console.warn("whoami", e);
          return { super: false } as WhoAmI;
        })
        .then((who) => {
          if (auth.currentUser?.uid !== user.uid) return;
          if (who.student) {
            const { schoolId, sid } = who.student;
            unsubDoc = onSnapshot(
              doc(db, sp(schoolId, `students/${sid}`)),
              (snap) => setSession({ kind: "student", user, schoolId, sid, student: snap.exists() ? { ...(snap.data() as StudentDoc), sid } : null }),
              (err) => setSession({ kind: "student", user, schoolId, sid, student: null, error: err.message }),
            );
          } else if (who.staff) {
            const { schoolId } = who.staff;
            unsubDoc = onSnapshot(
              doc(db, sp(schoolId, `staff/${user.uid}`)),
              (snap) =>
                snap.exists()
                  ? setSession({ kind: "staff", user, schoolId, isSuper: who.super, staff: { uid: user.uid, ...(snap.data() as Omit<StaffDoc, "uid">) } })
                  : setSession({ kind: "staffNew", user, isSuper: who.super }),
              () => setSession({ kind: "staffNew", user, isSuper: who.super }),
            );
          } else {
            setSession({ kind: "staffNew", user, isSuper: who.super, request: who.request });
          }
        });
    });
    return () => {
      unsubDoc?.();
      unsubAuth();
    };
  }, [tick]);

  return <Ctx.Provider value={{ session, refresh: () => setTick((t) => t + 1) }}>{children}</Ctx.Provider>;
}
