// 하주초 인증 항목(독서 마라톤·탄소중립·Speak up in English)을 운영 학교에 등록
// 사용: GOOGLE_APPLICATION_CREDENTIALS=서비스계정.json npx tsx scripts/seed-haju-programs.ts [학교 이름=하주초등학교]
// - 학교가 먼저 만들어져 있어야 함 (교사 회원가입으로 개설)
// - 이미 저장된 인증 항목이 있으면 덮어쓰지 않고, 같은 id 가 없는 항목만 뒤에 추가
import { initializeApp, applicationDefault } from "../functions/node_modules/firebase-admin/lib/app/index.js";
import { getFirestore, FieldValue } from "../functions/node_modules/firebase-admin/lib/firestore/index.js";
import { HAJU_PROGRAMS, type ProgramDef } from "../shared/domain";

const name = process.argv[2] ?? "하주초등학교";
initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT ?? "school-certification-e1a6c" });
const db = getFirestore();

const found = await db.collection("schools").where("name", "==", name).get();
if (found.empty) {
  console.error(`'${name}' 학교가 아직 없어요. 먼저 [회원가입(교사)]로 학교를 만드세요.`);
  process.exit(1);
}
for (const school of found.docs) {
  const ref = db.doc(`schools/${school.id}/config/app`);
  const cur = ((await ref.get()).get("programs") ?? []) as ProgramDef[];
  const add = HAJU_PROGRAMS.filter((p) => !cur.some((c) => c.id === p.id));
  // Firestore 는 undefined 값을 받지 않으므로 JSON 으로 한 번 정리
  await ref.set({ programs: JSON.parse(JSON.stringify([...cur, ...add])), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  console.log(`${name}(${school.id}): 기존 ${cur.length}개 + 추가 ${add.length}개 (${add.map((p) => p.name).join(", ") || "없음"})`);
}
