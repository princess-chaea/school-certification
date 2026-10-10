import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const useEmulators = import.meta.env.VITE_USE_EMULATORS === "1";

// 웹 설정값은 공개 정보(보안은 Firestore·Storage 규칙이 담당). 배포 시 .env.production 에 채운다.
const config = useEmulators
  ? { apiKey: "demo-key", authDomain: "demo-haju.firebaseapp.com", projectId: "demo-haju", storageBucket: "demo-haju.appspot.com", appId: "demo" }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

export const app = initializeApp(config);
export const auth = getAuth(app);
// ignoreUndefinedProperties: 직접 만든 인증 항목처럼 선택 칸이 undefined 인 객체도 저장되게
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  ...(useEmulators ? {} : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }),
});
export const storage = getStorage(app);
export const functions = getFunctions(app, "asia-northeast3");
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

if (useEmulators) {
  const host = location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectStorageEmulator(storage, host, 9199);
  connectFunctionsEmulator(functions, host, 5001);
}
export const IS_EMULATOR = useEmulators;
