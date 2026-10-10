// 웹앱과 Cloud Functions가 함께 쓰는 순수 도메인 로직 (Firebase 의존성 없음)

export const SCHOOL_EMAIL_DOMAIN = "haju.es.kr";
export const SCHOOL_YEAR = 2026;

export type ProgramId = "reading" | "carbon" | "english";
export type Medal = "none" | "bronze" | "silver" | "gold";
export type EnglishTaskId = "t1" | "t2" | "t3" | "t4";

export const PROGRAM_IDS: ProgramId[] = ["reading", "carbon", "english"];
export const MEDAL_ORDER: Medal[] = ["none", "bronze", "silver", "gold"];
export const MEDAL_LABEL: Record<Medal, string> = { none: "도전 중", bronze: "동", silver: "은", gold: "금" };

/** 학생 이메일 26GCNN@haju.es.kr → 학년(G)·반(C)·번호(NN) */
export function parseStudentEmail(email: string | null | undefined) {
  if (!email) return null;
  const m = /^(\d{2})(\d)(\d)(\d{2})@haju\.es\.kr$/i.exec(email.trim());
  if (!m) return null;
  const grade = Number(m[2]);
  const classNo = Number(m[3]);
  const number = Number(m[4]);
  if (grade < 1 || grade > 6 || classNo < 1 || number < 1) return null;
  return { sid: `${m[1]}${m[2]}${m[3]}${m[4]}`, grade, classNo, number };
}

/** 학년·반·번호 → 학생 ID (예: 3학년 1반 1번 → "263101") */
export function makeSid(grade: number, classNo: number, number: number, year = SCHOOL_YEAR) {
  return `${String(year).slice(2)}${grade}${classNo}${String(number).padStart(2, "0")}`;
}

export function classKey(grade: number, classNo: number) {
  return `${grade}-${classNo}`;
}

export interface EnglishTaskConfig {
  id: EnglishTaskId;
  name: string;
  kind: "sentences" | "photo" | "audio";
  goal: number; // 완료에 필요한 개수 (문장 수, 사진 장수, 녹음 권수)
  setIds?: string[]; // 문장 과제일 때 사용하는 세트
  minSeconds?: number; // 녹음 과제 최소 길이
  link?: string;
  description: string;
}

export interface ProgramConfig {
  id: ProgramId;
  name: string; // 인증분야 이름 (인증서에 표시)
  area: string; // 영역
  emoji: string;
  grades: number[]; // 대상 학년
  description: string;
  /** 학년별 인증 기준(=동). reading/carbon 전용 */
  baseByGrade?: Record<string, number>;
  unit?: string;
  activityTypes?: string[];
}

export interface AppConfig {
  medalMultipliers: { bronze: number; silver: number; gold: number };
  englishMedalTasks: { bronze: number; silver: number; gold: number };
  programs: Record<ProgramId, ProgramConfig>;
  englishTasks: EnglishTaskConfig[];
  ai: {
    enabled: boolean;
    photoModel: string;
    teacherModel: string;
    dailyLimit: number;
  };
  certificate: {
    title: string;
    schoolName: string;
    principal: string;
    issueDate: string; // 예: "2026년 12월 0일"
    body: string;
    showSealOnWeb: boolean; // 웹 인증서에 직인 표시 (기본: 표시 안 함, 한글 일괄 출력에는 항상 포함)
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  medalMultipliers: { bronze: 1, silver: 1.5, gold: 2 },
  englishMedalTasks: { bronze: 2, silver: 3, gold: 4 },
  programs: {
    reading: {
      id: "reading",
      name: "도전! 독서 마라톤",
      area: "인문",
      emoji: "📚",
      grades: [1, 2, 3, 4, 5, 6],
      description: "책을 읽고 독서기록장에 독후 감상을 적어요. 기록장 1쪽을 성실히 채우면 1편으로 인정해요.",
      baseByGrade: { "1": 30, "2": 50, "3": 40, "4": 40, "5": 30, "6": 30 },
      unit: "편",
    },
    carbon: {
      id: "carbon",
      name: "탄소중립! 환경 지킴이",
      area: "봉사",
      emoji: "🌏",
      grades: [1, 2, 3, 4, 5, 6],
      description: "탄소중립·환경 보호 활동을 실천하고 사진과 소감을 올려요. 주 1회 이상 꾸준히!",
      baseByGrade: { "1": 20, "2": 20, "3": 20, "4": 20, "5": 20, "6": 20 },
      unit: "회",
      activityTypes: ["분리수거", "플로깅", "대중교통·걷기", "다회용기·텀블러", "식물 기르기", "전기·물 아끼기", "잔반 없는 날", "기타"],
    },
    english: {
      id: "english",
      name: "Speak up in English",
      area: "외국어",
      emoji: "🗣️",
      grades: [4, 5, 6],
      description: "영어 말하기 과제 4개 중 2개 이상을 완료하면 인증이에요.",
    },
  },
  englishTasks: [
    {
      id: "t1",
      name: "오늘의 카툰 한 문장",
      kind: "sentences",
      goal: 30,
      setIds: ["task1-cartoon"],
      description: "45문장 중 30문장을 해석 보고 타이핑하고 녹음해요 (3회 반복 후 선생님 검사).",
    },
    {
      id: "t2",
      name: "알공",
      kind: "photo",
      goal: 1,
      description: "알공 학습을 완료하고 완료 화면을 캡처해서 올려요.",
    },
    {
      id: "t3",
      name: "교과서 주요문장",
      kind: "sentences",
      goal: 40,
      setIds: ["task3-grade4", "task3-grade5", "task3-grade6"],
      description: "우리 학년 교과서 주요문장 40개를 해석 보고 타이핑하고 녹음해요.",
    },
    {
      id: "t4",
      name: "EBSe 펀리딩 낭독",
      kind: "audio",
      goal: 4,
      minSeconds: 120,
      link: "https://www.ebse.co.kr/apps/funReading/workBook.do",
      description: "펀리딩 영어 동화책을 2분 이상 소리 내어 읽고 녹음해요 (4권).",
    },
  ],
  ai: {
    enabled: true,
    photoModel: "claude-haiku-5-5",
    teacherModel: "claude-sonnet-5-5",
    dailyLimit: 3000,
  },
  certificate: {
    title: "학교장 인증서",
    schoolName: "하주초등학교",
    principal: "하주초등학교장 문석주",
    issueDate: "2026년 12월 0일",
    body: "위 학생은 「2026 도전! 꿈 성취 학교장 인증제」에 참가하여 위 분야에서 인증받았기에 이 증서를 드립니다.",
    showSealOnWeb: false,
  },
};

/** 저장된 설정(부분)을 기본값과 합친다 */
export function mergeConfig(partial?: Partial<AppConfig> | null): AppConfig {
  if (!partial) return DEFAULT_CONFIG;
  const programs = { ...DEFAULT_CONFIG.programs };
  for (const id of PROGRAM_IDS) {
    if (partial.programs?.[id]) programs[id] = { ...DEFAULT_CONFIG.programs[id], ...partial.programs[id] };
  }
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    medalMultipliers: { ...DEFAULT_CONFIG.medalMultipliers, ...partial.medalMultipliers },
    englishMedalTasks: { ...DEFAULT_CONFIG.englishMedalTasks, ...partial.englishMedalTasks },
    ai: { ...DEFAULT_CONFIG.ai, ...partial.ai },
    certificate: { ...DEFAULT_CONFIG.certificate, ...partial.certificate },
    programs,
    englishTasks: partial.englishTasks?.length ? partial.englishTasks : DEFAULT_CONFIG.englishTasks,
  };
}

export interface MedalThresholds {
  bronze: number;
  silver: number;
  gold: number;
}

/** 독서·탄소중립의 학년별 금은동 기준 (동 = 계획서 인증 기준) */
export function thresholdsFor(config: AppConfig, program: "reading" | "carbon", grade: number): MedalThresholds | null {
  const p = config.programs[program];
  if (!p.grades.includes(grade)) return null;
  const base = p.baseByGrade?.[String(grade)];
  if (!base) return null;
  const m = config.medalMultipliers;
  return {
    bronze: Math.ceil(base * m.bronze),
    silver: Math.ceil(base * m.silver),
    gold: Math.ceil(base * m.gold),
  };
}

export function medalFor(count: number, t: MedalThresholds): Medal {
  if (count >= t.gold) return "gold";
  if (count >= t.silver) return "silver";
  if (count >= t.bronze) return "bronze";
  return "none";
}

/** 다음 단계까지 남은 개수 */
export function nextStep(count: number, t: MedalThresholds): { medal: Medal; remaining: number } | null {
  for (const medal of ["bronze", "silver", "gold"] as const) {
    if (count < t[medal]) return { medal, remaining: t[medal] - count };
  }
  return null;
}

export function englishTaskForGrade(task: EnglishTaskConfig, grade: number) {
  if (task.id === "t3") return { ...task, setIds: [`task3-grade${grade}`] };
  return task;
}

export interface EnglishCounts {
  t1: number;
  t2: number;
  t3: number;
  t4: number;
}

export function englishProgress(config: AppConfig, counts: EnglishCounts) {
  const tasks = config.englishTasks.map((t) => {
    const done = counts[t.id] ?? 0;
    return { id: t.id, name: t.name, done: Math.min(done, t.goal), goal: t.goal, complete: done >= t.goal };
  });
  const completed = tasks.filter((t) => t.complete).length;
  const m = config.englishMedalTasks;
  const medal: Medal = completed >= m.gold ? "gold" : completed >= m.silver ? "silver" : completed >= m.bronze ? "bronze" : "none";
  return { tasks, completed, medal };
}

export interface ProgramProgress {
  count: number;
  medal: Medal;
  thresholds?: MedalThresholds | null;
}

export interface StudentProgress {
  reading?: ProgramProgress;
  carbon?: ProgramProgress;
  english?: { counts: EnglishCounts; completed: number; medal: Medal };
}

export function computeProgress(
  config: AppConfig,
  grade: number,
  counts: { reading: number; carbon: number; english: EnglishCounts },
): StudentProgress {
  const out: StudentProgress = {};
  for (const program of ["reading", "carbon"] as const) {
    const t = thresholdsFor(config, program, grade);
    if (t) out[program] = { count: counts[program], medal: medalFor(counts[program], t), thresholds: t };
  }
  if (config.programs.english.grades.includes(grade)) {
    const e = englishProgress(config, counts.english);
    out.english = { counts: counts.english, completed: e.completed, medal: e.medal };
  }
  return out;
}

export function isCertified(medal: Medal | undefined) {
  return medal === "bronze" || medal === "silver" || medal === "gold";
}
