// 인증 항목 템플릿 (교육감 인증제 항목 + 2025 우수학교 공통 항목 정리)
// 관리자가 [인증 항목 → 템플릿에서 추가]로 고른 뒤 이름·기준을 학교에 맞게 고친다.
import type { ProgramDef } from "./domain";

export type ProgramTemplate = ProgramDef & { source: "교육감" | "우수사례" | "공통" };

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
 {
  "id": "reading-log",
  "name": "독서 마라톤(독서록)",
  "area": "인문",
  "icon": "book",
  "description": "책을 한 권 읽을 때마다 독서록 한 편을 써요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "편",
  "evidence": [
   "photo",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "1": 30,
   "2": 30,
   "3": 30,
   "4": 30,
   "5": 30,
   "6": 30
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "reading-log",
  "textPrompt": "줄거리와 인상 깊은 장면, 나의 생각을 적어 보세요.",
  "fields": [
   {
    "key": "bookTitle",
    "label": "책 제목"
   },
   {
    "key": "author",
    "label": "지은이"
   }
  ],
  "source": "우수사례"
 },
 {
  "id": "reading-questions",
  "name": "생각이 자라는 질문",
  "area": "인문",
  "icon": "speech",
  "description": "책을 읽고 친구와 나눌 질문을 만들어요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   3,
   4,
   5,
   6
  ],
  "unit": "개",
  "evidence": [
   "text"
  ],
  "required": [
   "text"
  ],
  "targetByGrade": {
   "3": 20,
   "4": 20,
   "5": 20,
   "6": 20
  },
  "approval": "teacher",
  "aiReview": false,
  "templateId": "reading-questions",
  "textPrompt": "책 내용에 대한 '왜?', '만약 ~라면?' 질문을 써 보세요.",
  "fields": [
   {
    "key": "bookTitle",
    "label": "책 제목"
   }
  ],
  "source": "우수사례"
 },
 {
  "id": "gb-bookfriend",
  "name": "경북독서친구 독후활동",
  "area": "인문",
  "icon": "book",
  "description": "학년별 권장도서를 읽고 독후활동을 올려요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   5,
   6
  ],
  "unit": "편",
  "evidence": [
   "photo",
   "link"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "5": 20,
   "6": 20
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "gb-bookfriend",
  "textPrompt": "책을 읽고 달라진 내 생각이나 다짐을 적어 보세요.",
  "fields": [
   {
    "key": "bookTitle",
    "label": "책 제목"
   }
  ],
  "source": "교육감"
 },
 {
  "id": "vocab-notebook",
  "name": "나만의 어휘장",
  "area": "인문",
  "icon": "pen",
  "description": "새로 알게 된 낱말과 예문을 정리해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   3,
   4,
   5,
   6
  ],
  "unit": "개",
  "evidence": [
   "photo",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "3": 30,
   "4": 30,
   "5": 30,
   "6": 30
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "vocab-notebook",
  "textPrompt": "낱말 뜻과 직접 만든 예문을 써 보세요.",
  "fields": [
   {
    "key": "word",
    "label": "낱말"
   }
  ],
  "source": "교육감"
 },
 {
  "id": "write-my-book",
  "name": "책 쓰는 아이들",
  "area": "인문",
  "icon": "pen",
  "description": "나의 이야기로 한 쪽씩 책을 써 나가요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   3,
   4,
   5,
   6
  ],
  "unit": "쪽",
  "evidence": [
   "file",
   "photo"
  ],
  "required": [
   "file"
  ],
  "targetByGrade": {
   "3": 30,
   "4": 30,
   "5": 30,
   "6": 30
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "write-my-book",
  "textPrompt": "오늘 쓴 부분의 내용을 간단히 소개해 주세요.",
  "source": "교육감"
 },
 {
  "id": "gratitude-diary",
  "name": "두 줄 감사일기",
  "area": "인성",
  "icon": "heart",
  "description": "하루에 감사한 일을 두 줄 이상 적어요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "일",
  "evidence": [
   "text",
   "photo"
  ],
  "required": [
   "text"
  ],
  "targetByGrade": {
   "1": 30,
   "2": 30,
   "3": 30,
   "4": 30,
   "5": 30,
   "6": 30
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "gratitude-diary",
  "textPrompt": "오늘 감사했던 일 두 가지를 적어 보세요.",
  "source": "우수사례"
 },
 {
  "id": "dokdo-guardian",
  "name": "우리 땅 독도 지킴이",
  "area": "인문",
  "icon": "globe",
  "description": "사이버독도학교 수료 후 독도 사랑 활동을 해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   3,
   4,
   5,
   6
  ],
  "unit": "개",
  "evidence": [
   "photo",
   "file",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "3": 5,
   "4": 5,
   "5": 5,
   "6": 5
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "dokdo-guardian",
  "textPrompt": "활동 내용과 소감을 100자 이상 써 보세요.",
  "fields": [
   {
    "key": "activityType",
    "label": "활동 종류(이수증/체험/독서/미술 등)"
   }
  ],
  "source": "교육감"
 },
 {
  "id": "carbon-neutral",
  "name": "탄소중립 실천",
  "area": "환경",
  "icon": "earth",
  "description": "하루 한 가지 탄소중립 생활을 실천하고 기록해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "일",
  "evidence": [
   "photo",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "1": 30,
   "2": 30,
   "3": 30,
   "4": 30,
   "5": 30,
   "6": 30
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "carbon-neutral",
  "textPrompt": "무엇을 실천했는지와 소감을 50~100자로 적어 보세요.",
  "fields": [
   {
    "key": "action",
    "label": "실천 내용(분리배출/텀블러/전기끄기 등)"
   }
  ],
  "source": "교육감"
 },
 {
  "id": "plogging",
  "name": "플로깅·줍깅",
  "area": "봉사",
  "icon": "leaf",
  "description": "걷거나 뛰면서 쓰레기를 주워요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "회",
  "evidence": [
   "photo",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "1": 10,
   "2": 10,
   "3": 10,
   "4": 10,
   "5": 10,
   "6": 10
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "plogging",
  "textPrompt": "어디서 무엇을 주웠는지 적어 보세요.",
  "fields": [
   {
    "key": "place",
    "label": "장소"
   }
  ],
  "source": "우수사례"
 },
 {
  "id": "volunteer",
  "name": "봉사활동",
  "area": "봉사",
  "icon": "heart",
  "description": "교실·학교·마을에서 봉사활동을 해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "회",
  "evidence": [
   "photo",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "1": 5,
   "2": 5,
   "3": 5,
   "4": 5,
   "5": 5,
   "6": 5
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "volunteer",
  "textPrompt": "어떤 봉사를 했고 어떤 마음이 들었나요?",
  "fields": [
   {
    "key": "place",
    "label": "장소"
   }
  ],
  "source": "우수사례"
 },
 {
  "id": "english-sentences",
  "name": "영어 교과서 핵심 문장",
  "area": "외국어",
  "icon": "speech",
  "description": "교과서 핵심 문장을 소리 내어 말하고 녹음해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   3,
   4,
   5,
   6
  ],
  "unit": "문장",
  "evidence": [
   "audio"
  ],
  "required": [
   "audio"
  ],
  "targetByGrade": {
   "3": 20,
   "4": 20,
   "5": 20,
   "6": 20
  },
  "approval": "teacher",
  "aiReview": false,
  "templateId": "english-sentences",
  "textPrompt": "말한 문장을 영어로 적어 보세요.",
  "fields": [
   {
    "key": "sentence",
    "label": "영어 문장"
   }
  ],
  "source": "우수사례"
 },
 {
  "id": "ebs-cartoon-sentence",
  "name": "EBSe 오늘의 카툰 한 문장",
  "area": "외국어",
  "icon": "speech",
  "description": "오늘의 카툰 한 문장을 따라 말하고 녹음해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   4,
   5,
   6
  ],
  "unit": "문장",
  "evidence": [
   "audio",
   "text"
  ],
  "required": [
   "audio"
  ],
  "targetByGrade": {
   "4": 30,
   "5": 30,
   "6": 30
  },
  "approval": "teacher",
  "aiReview": false,
  "templateId": "ebs-cartoon-sentence",
  "textPrompt": "오늘의 문장과 뜻을 적어 보세요.",
  "fields": [
   {
    "key": "day",
    "label": "Day"
   }
  ],
  "source": "교육감"
 },
 {
  "id": "ai-pengtalk",
  "name": "AI 펭톡 토픽 월드",
  "area": "외국어",
  "icon": "globe",
  "description": "AI 펭톡에서 토픽 월드를 하나씩 완료해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   3,
   4,
   5,
   6
  ],
  "unit": "개",
  "evidence": [
   "photo"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "3": 10,
   "4": 10,
   "5": 10,
   "6": 10
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "ai-pengtalk",
  "textPrompt": "완료 화면을 캡처해서 올려 주세요.",
  "fields": [
   {
    "key": "topic",
    "label": "토픽 이름"
   }
  ],
  "source": "교육감"
 },
 {
  "id": "english-read-aloud",
  "name": "영어 동화 낭독",
  "area": "외국어",
  "icon": "book",
  "description": "EBSe 펀리딩 동화책을 2분 이상 낭독해 녹음해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   4,
   5,
   6
  ],
  "unit": "권",
  "evidence": [
   "audio"
  ],
  "required": [
   "audio"
  ],
  "targetByGrade": {
   "4": 4,
   "5": 4,
   "6": 4
  },
  "approval": "teacher",
  "aiReview": false,
  "templateId": "english-read-aloud",
  "fields": [
   {
    "key": "bookTitle",
    "label": "책 제목"
   }
  ],
  "source": "교육감"
 },
 {
  "id": "jump-rope",
  "name": "줄넘기 도전",
  "area": "체육",
  "icon": "rope",
  "description": "줄넘기 급수에 도전하고 기록을 남겨요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "회",
  "evidence": [
   "photo",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "1": 20,
   "2": 20,
   "3": 20,
   "4": 20,
   "5": 20,
   "6": 20
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "jump-rope",
  "textPrompt": "오늘의 종목과 개수를 적어 보세요.",
  "fields": [
   {
    "key": "jumpType",
    "label": "종목(모아뛰기/엑스뛰기/2단 등)"
   },
   {
    "key": "jumpCount",
    "label": "개수"
   }
  ],
  "source": "우수사례"
 },
 {
  "id": "walk-run",
  "name": "아침 걷기·달리기",
  "area": "체육",
  "icon": "run",
  "description": "운동장을 걷거나 달리고 바퀴 수를 기록해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "회",
  "evidence": [
   "photo",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "1": 20,
   "2": 20,
   "3": 20,
   "4": 20,
   "5": 20,
   "6": 20
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "walk-run",
  "fields": [
   {
    "key": "laps",
    "label": "바퀴 수"
   }
  ],
  "source": "우수사례"
 },
 {
  "id": "trekking",
  "name": "우리 고장 트레킹",
  "area": "체육",
  "icon": "run",
  "description": "가족과 함께 고장의 명소를 걷고 탐방해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   3,
   4,
   5,
   6
  ],
  "unit": "곳",
  "evidence": [
   "photo",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "3": 3,
   "4": 3,
   "5": 3,
   "6": 3
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "trekking",
  "textPrompt": "탐방일, 장소, 소감을 적어 보세요.",
  "fields": [
   {
    "key": "place",
    "label": "탐방 장소"
   },
   {
    "key": "companion",
    "label": "함께한 보호자"
   }
  ],
  "source": "교육감"
 },
 {
  "id": "bike-license",
  "name": "자전거 면허 도전",
  "area": "체육",
  "icon": "bike",
  "description": "안전교육을 받고 주행 연습을 기록해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   3,
   4,
   5,
   6
  ],
  "unit": "회",
  "evidence": [
   "photo",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "3": 10,
   "4": 10,
   "5": 10,
   "6": 10
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "bike-license",
  "fields": [
   {
    "key": "laps",
    "label": "주행 바퀴/거리"
   }
  ],
  "source": "우수사례"
 },
 {
  "id": "zero-waste-meal",
  "name": "잔반 없는 날",
  "area": "건강",
  "icon": "meal",
  "description": "급식을 남김없이 먹고 빈 식판 사진을 올려요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "회",
  "evidence": [
   "photo"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "1": 20,
   "2": 20,
   "3": 20,
   "4": 20,
   "5": 20,
   "6": 20
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "zero-waste-meal",
  "source": "우수사례"
 },
 {
  "id": "tooth-brushing",
  "name": "점심 양치 습관",
  "area": "건강",
  "icon": "tooth",
  "description": "점심 먹은 뒤 양치하고 기록해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "일",
  "evidence": [
   "photo",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "1": 30,
   "2": 30,
   "3": 30,
   "4": 30,
   "5": 30,
   "6": 30
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "tooth-brushing",
  "source": "우수사례"
 },
 {
  "id": "health-habit",
  "name": "건강 습관 만들기",
  "area": "건강",
  "icon": "heart",
  "description": "나만의 건강 습관을 정해 꾸준히 실천해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "일",
  "evidence": [
   "photo",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "1": 20,
   "2": 20,
   "3": 20,
   "4": 20,
   "5": 20,
   "6": 20
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "health-habit",
  "textPrompt": "어떤 습관을 실천했나요?",
  "fields": [
   {
    "key": "habit",
    "label": "습관(손씻기/물마시기/스트레칭 등)"
   }
  ],
  "source": "우수사례"
 },
 {
  "id": "dream-art-challenge",
  "name": "꿈다락 챌린지",
  "area": "예술",
  "icon": "palette",
  "description": "음악·미술·춤 도전을 날짜를 달리해 영상이나 사진으로 올려요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "회",
  "evidence": [
   "photo",
   "file",
   "link"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "1": 10,
   "2": 10,
   "3": 10,
   "4": 10,
   "5": 10,
   "6": 10
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "dream-art-challenge",
  "textPrompt": "오늘 연습한 내용과 나아진 점을 적어 보세요.",
  "fields": [
   {
    "key": "field",
    "label": "분야(악기/노래/미술/춤)"
   }
  ],
  "source": "교육감"
 },
 {
  "id": "instrument",
  "name": "악기 연주",
  "area": "예술",
  "icon": "music",
  "description": "리코더·단소 등 악기로 곡을 완주해 녹음해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "곡",
  "evidence": [
   "audio",
   "file"
  ],
  "required": [
   "audio"
  ],
  "targetByGrade": {
   "1": 2,
   "2": 2,
   "3": 2,
   "4": 2,
   "5": 2,
   "6": 2
  },
  "approval": "teacher",
  "aiReview": false,
  "templateId": "instrument",
  "fields": [
   {
    "key": "song",
    "label": "곡 이름"
   },
   {
    "key": "instrument",
    "label": "악기"
   }
  ],
  "source": "우수사례"
 },
 {
  "id": "typing",
  "name": "타자 연습",
  "area": "과학·디지털",
  "icon": "code",
  "description": "타자 연습을 하고 결과 화면을 올려요. (연습 횟수로 인정)",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "회",
  "evidence": [
   "photo",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {"1": 20, "2": 20, "3": 20, "4": 20, "5": 20, "6": 20},
  "approval": "teacher",
  "aiReview": true,
  "templateId": "typing",
  "textPrompt": "오늘의 타수와 정확도를 적어 보세요.",
  "fields": [
   {
    "key": "speed",
    "label": "타수(분당)"
   }
  ],
  "source": "우수사례"
 },
 {
  "id": "ai-courseware",
  "name": "AI 코스웨어 학습",
  "area": "과학·디지털",
  "icon": "code",
  "description": "AI 코스웨어로 학습하고 완료 화면을 올려요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   3,
   4,
   5,
   6
  ],
  "unit": "회",
  "evidence": [
   "photo"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "3": 20,
   "4": 20,
   "5": 20,
   "6": 20
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "ai-courseware",
  "fields": [
   {
    "key": "subject",
    "label": "과목/프로그램"
   }
  ],
  "source": "우수사례"
 },
 {
  "id": "ai-web-maker",
  "name": "AI 꼬마 개발자",
  "area": "과학·디지털",
  "icon": "code",
  "description": "생성형 AI로 나만의 웹페이지나 게임을 만들어요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   5,
   6
  ],
  "unit": "개",
  "evidence": [
   "link",
   "photo",
   "text"
  ],
  "required": [
   "link"
  ],
  "targetByGrade": {
   "5": 1,
   "6": 1
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "ai-web-maker",
  "textPrompt": "무엇을 만들었고 AI에게 어떻게 요청했는지 적어 보세요.",
  "source": "우수사례"
 },
 {
  "id": "edupark-stamp",
  "name": "과학관·체험관 탐방",
  "area": "과학·디지털",
  "icon": "flask",
  "description": "과학관·박물관·체험관을 방문하고 보고서를 써요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "곳",
  "evidence": [
   "photo",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "1": 5,
   "2": 5,
   "3": 5,
   "4": 5,
   "5": 5,
   "6": 5
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "edupark-stamp",
  "textPrompt": "방문 기관과 배운 점을 적어 보세요.",
  "fields": [
   {
    "key": "place",
    "label": "기관 이름"
   }
  ],
  "source": "교육감"
 },
 {
  "id": "young-ceo",
  "name": "꼬마 CEO 경제 도전",
  "area": "진로",
  "icon": "star",
  "description": "기업가 인터뷰, 브랜드 만들기 등 경제 미션을 해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   5,
   6
  ],
  "unit": "개",
  "evidence": [
   "photo",
   "text",
   "file"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "5": 5,
   "6": 5
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "young-ceo",
  "fields": [
   {
    "key": "mission",
    "label": "미션(인터뷰/브랜드/판매 등)"
   }
  ],
  "source": "교육감"
 },
 {
  "id": "campaign",
  "name": "학교폭력예방·인성 캠페인",
  "area": "인성",
  "icon": "heart",
  "description": "캠페인·공모전에 참여하고 작품을 올려요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   3,
   4,
   5,
   6
  ],
  "unit": "회",
  "evidence": [
   "photo",
   "file",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "3": 2,
   "4": 2,
   "5": 2,
   "6": 2
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "campaign",
  "textPrompt": "전하고 싶은 메시지를 적어 보세요.",
  "source": "우수사례"
 },
 {
  "id": "my-own-challenge",
  "name": "나만의 도전",
  "area": "자율",
  "icon": "trophy",
  "description": "내가 정한 목표를 꾸준히 실천해요.",
  "kind": "evidence",
  "enabled": true,
  "grades": [
   1,
   2,
   3,
   4,
   5,
   6
  ],
  "unit": "회",
  "evidence": [
   "photo",
   "text"
  ],
  "required": [
   "photo"
  ],
  "targetByGrade": {
   "1": 10,
   "2": 10,
   "3": 10,
   "4": 10,
   "5": 10,
   "6": 10
  },
  "approval": "teacher",
  "aiReview": true,
  "templateId": "my-own-challenge",
  "textPrompt": "오늘 실천한 내용을 적어 보세요.",
  "fields": [
   {
    "key": "goal",
    "label": "나의 목표"
   }
  ],
  "source": "우수사례"
 }
];

/** 영어 문장 연습(과제형) 템플릿: English Speak Up 4과제 */
export const ENGLISH_TASKS_TEMPLATE_ID = "english-speak-up";
