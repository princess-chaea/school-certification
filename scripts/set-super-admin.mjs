// 플랫폼 운영자(학교 개설 승인 권한) 지정: node scripts/set-super-admin.mjs 이메일
// GOOGLE_APPLICATION_CREDENTIALS(서비스 계정 키) 가 설정된 상태에서 실행. 해당 이메일로 한 번 이상 로그인한 뒤 실행해야 함.
const email = process.argv[2];
if (!email) {
  console.error("사용법: node scripts/set-super-admin.mjs 이메일");
  process.exit(1);
}
const { initializeApp, applicationDefault } = await import("../functions/node_modules/firebase-admin/lib/app/index.js");
const { getAuth } = await import("../functions/node_modules/firebase-admin/lib/auth/index.js");
const { getFirestore, FieldValue } = await import("../functions/node_modules/firebase-admin/lib/firestore/index.js");
initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT ?? "school-certification-e1a6c" });
const user = await getAuth().getUserByEmail(email);
await getFirestore().doc(`superAdmins/${user.uid}`).set({ email, createdAt: FieldValue.serverTimestamp() });
console.log(`운영자로 지정했어요: ${email} (${user.uid})`);
