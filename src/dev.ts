// 에뮬레이터 전용: Google 팝업 없이 테스트 계정으로 로그인 (화면 테스트·캡처용)
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

export function installDevHelpers() {
  (window as unknown as { __devLogin: (email: string) => Promise<void> }).__devLogin = async (email) => {
    await signInWithEmailAndPassword(auth, email, "test-password");
  };
}
