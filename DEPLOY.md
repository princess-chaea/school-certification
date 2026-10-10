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

# 직인 이미지(학교별 업로드)를 인증서 한글 출력에 쓰기 위한 CORS
gsutil cors set storage.cors.json gs://school-certification-e1a6c.firebasestorage.app
```

## 3. 첫 학교(하주초) 열기

1. 배포 주소(`https://school-certification-e1a6c.web.app`)에서 **운영자 계정**(dltjdrms320@gmail.com 등)으로 로그인
2. `node scripts/set-super-admin.mjs <운영자 이메일>` → 운영자 지정
3. 같은 계정으로 [선생님 가입·학교 개설] → NEIS에서 "하주초등학교" 검색 → 개설 신청
4. 상단 [운영자] → 개설 신청 승인 → 신청자가 하주초 **관리자**가 됨
5. 관리자 → [설정]: 교표·직인 업로드, 학교장 성함 입력 / [설정 → 데이터 도구] 영어 문장 세트 올리기
6. 관리자 → [구성원 → 학생 명단 CSV]: 양식 내려받아 명단 업로드
7. 선생님들 가입 → [구성원]에서 승인

## 4. 로컬 테스트 (에뮬레이터)

```bash
cd functions && npm run build && cd ..
npx firebase-tools@13.35.1 emulators:start --project demo-haju --only auth,firestore,storage,functions
node scripts/emulator-seed.mjs        # 테스트 학교(7000001)·계정·예시 데이터
npx vite --mode emulator              # .env.emulator: VITE_USE_EMULATORS=1
# 브라우저 콘솔: __devLogin("264101@haju.es.kr") / "teacher41@test.kr" / "english@test.kr" / "admin@test.kr"
```

> 참고: firebase-tools 15.x 는 이 개발 환경 프록시에서 에뮬레이터 내부 통신(127.0.0.1)까지 프록시로 보내는 문제가 있어 13.35.1 을 씁니다.
