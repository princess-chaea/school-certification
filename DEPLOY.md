# 배포 안내 (Firebase: `school-certification-e1a6c`)

> 새 Claude 세션에서 "DEPLOY.md 보고 배포 이어서 해줘"라고 하면 아래 순서대로 진행합니다.

## 0. 준비물 (클라우드 환경 → 편집 → Network secrets / 환경 변수)

| 이름 | 내용 |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 서비스 계정(`claude-deployer`, 역할: 편집자 + Secret Manager 관리자) JSON 키 전체 |
| `ANTHROPIC_API_KEY` | Claude API 키 |
| `NEIS_API_KEY` | NEIS 교육정보 개방 포털 인증키 |

키는 레포와 채팅에 올리지 않습니다.

## 1. 콘솔에서 한 번만 (사람이 클릭)

1. **Authentication → 로그인 방법 → Google 사용 설정**
2. **Firestore Database 만들기**: 위치 `asia-northeast3 (서울)`, 프로덕션 모드
3. **Storage 시작하기**: 같은 위치
4. (Blaze 요금제 등록 완료) **예산 알림** $1 설정 권장

## 2. 배포 명령 (Claude 가 실행)

```bash
printf '%s' "$GOOGLE_SERVICE_ACCOUNT_JSON" > /tmp/sa.json && export GOOGLE_APPLICATION_CREDENTIALS=/tmp/sa.json
npm ci && (cd functions && npm ci)

# 웹 앱 설정값 → .env.production (공개 정보)
firebase apps:list WEB --project school-certification-e1a6c || firebase apps:create WEB "학교장 인증제" --project school-certification-e1a6c
firebase apps:sdkconfig WEB --project school-certification-e1a6c   # 값을 .env.production 의 VITE_FIREBASE_* 에 기록

# 비밀값
printf '%s' "$ANTHROPIC_API_KEY" | firebase functions:secrets:set ANTHROPIC_API_KEY --data-file=- --project school-certification-e1a6c
printf '%s' "$NEIS_API_KEY"      | firebase functions:secrets:set NEIS_API_KEY --data-file=- --project school-certification-e1a6c

npm run build
firebase deploy --only firestore,storage,functions,hosting --project school-certification-e1a6c

# 직인 이미지(학교 담당자가 업로드)를 인증서 한글 출력에 넣기 위한 CORS
gsutil cors set storage.cors.json gs://school-certification-e1a6c.firebasestorage.app
```

## 2-1. Vercel (화면 배포)

- 프로젝트: lees-projects-65bdf891/school-certification → https://school-certification.vercel.app (main에 푸시하면 자동 배포)
- Environment Variables: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` (Firebase 콘솔 → 프로젝트 설정 → 웹 앱). 값을 넣거나 바꾼 뒤에는 **Redeploy**해야 반영된다(빌드할 때 들어감)
- Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 `school-certification.vercel.app` 추가
- 데이터베이스 규칙·Cloud Functions·Storage는 Firebase에 따로 배포한다(아래)

## 2-2. 오프라인 활동 일괄 인정 기능 배포 순서

일괄 체크는 교사 화면, Cloud Functions, Firestore 규칙이 함께 바뀐다. 운영 중인 학교에서는 다음 순서를 지킨다.

1. Functions를 먼저 배포한다. `bulkRecognize`, `requestJoin`, `onSubmissionWritten`, `onEnglishItemWritten`이 새 코드여야 한다. `requestJoin`은 이미 권한을 받은 교사가 가입 요청으로 담당 범위를 다시 쓰지 못하게 한다.
2. 새 화면을 `main`에 반영하고 Vercel 운영 배포가 준비된 뒤, 관리자와 권한을 받은 교사의 일괄 체크 화면을 확인한다. 관리자는 모든 항목을 볼 수 있고, 일반교사는 허용된 항목과 담당 학생만 볼 수 있다.
3. 마지막에 Firestore 규칙을 배포한다. 새 규칙은 브라우저에서 제출 기록을 직접 생성하는 구형 일괄 체크를 막고, 서버 함수만 새 기록을 만들게 한다. 이전 화면이 열린 기기에는 새로고침을 안내한다.

검증할 때는 권한 없는 일반교사의 탭과 `/bulk` 직접 접근, 항목별 권한 부여·회수, 영어 세부 과제의 오프라인 인정, 재시도 시 중복 인정 방지, 학생 진행도 반영을 확인한다.

## 3. 첫 학교(하주초) 열기

1. 배포 주소(`https://school-certification.vercel.app`, Vercel이 main 브랜치를 자동 배포)에서 **운영자 계정**(dltjdrms320@gmail.com 등)으로 로그인
2. `node scripts/set-super-admin.mjs <운영자 이메일>` → 운영자 지정
3. 같은 계정으로 오른쪽 위 [회원가입(교사)] → NEIS에서 "하주초등학교" 검색 → 역할 체크(학교 담당자·담임·전담 중복 가능) → 바로 학교가 만들어지고 **학교 담당자**가 됨
   - 하주초 인증 항목(독서 마라톤·탄소중립·Speak up in English)은 학교를 만든 뒤 `GOOGLE_APPLICATION_CREDENTIALS=… npx tsx scripts/seed-haju-programs.ts`로 한 번에 등록 (이미 있는 항목은 건너뜀)
4. 학교 담당자 → [설정]: 교표·**직인(배경 투명 PNG 권장)** 등록, 학교장 성함 입력, 직인 크기 조절 / [설정 → 데이터 도구] 영어 문장 세트 올리기
   - 직인은 양식에 들어 있지 않고, 등록한 직인이 인증서의 학교장 이름 마지막 글자에 겹쳐 찍힌다(웹·한글 모두)
5. 학교 담당자 → [구성원 → 학생 명단 CSV]: 양식 내려받아 명단 업로드
6. 선생님들 가입: 지금은 가입 즉시 사용(승인 없음). 실제 학생 데이터를 운영할 때는 [설정 → 교사·담당자 가입 방식]을 **학교 담당자 승인 후 사용**으로 바꾸는 것을 권장
7. [인증서]에서 양식 선택: **테두리 있음**(학교장 인증서.hwpx) / **테두리 없음**(학교장 인증서(테두리X).hwpx, 학교 상장 용지 인쇄용), 직인 넣기 선택

### 참고
- AI 결과(사진·글 1차 확인)는 `schools/{id}/aiReviews`에 저장되고 교사·담당자만 읽을 수 있다. 학생 화면에는 AI 결과를 보여 주지 않는다.
- 학교 담당자의 [인증 항목 → 기능 요청]은 `featureRequests`에 쌓이고, 시스템 관리자가 상단 [시스템]에서 확인한다.

## 4. 로컬 테스트 (에뮬레이터)

```bash
cd functions && npm run build && cd ..
npx firebase-tools@13.35.1 emulators:start --project demo-haju --only auth,firestore,storage,functions
node scripts/emulator-seed.mjs        # 테스트 학교(7000001)·계정·예시 데이터
npx vite --mode emulator              # .env.emulator: VITE_USE_EMULATORS=1
# 브라우저 콘솔: __devLogin("264101@haju.es.kr") / "teacher41@test.kr" / "english@test.kr" / "admin@test.kr"
```

> 참고: firebase-tools 15.x 는 이 개발 환경 프록시에서 에뮬레이터 내부 통신(127.0.0.1)까지 프록시로 보내는 문제가 있어 13.35.1 을 씁니다.
