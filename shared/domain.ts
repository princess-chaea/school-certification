// 웹앱과 Cloud Functions가 함께 쓰는 순수 도메인 로직 (Firebase 의존성 없음)
// 모든 학교가 같은 엔진을 쓰고, 학교마다 인증 항목(ProgramDef)만 다르게 설정한다.

export const SCHOOL_YEAR = 2026;

export type Medal = "none" | "bronze" | "silver" | "gold";
export type EvidenceKind = "photo" | "text" | "file" | "audio" | "link";
export type ProgramId = string;

export const MEDAL_ORDER: Medal[] = ["none", "bronze", "silver", "gold"];
export const MEDAL_LABEL: Record<Medal, string> = { none: "도전 중", bronze: "동", silver: "은", gold: "금" };
export const EVIDENCE_LABEL: Record<EvidenceKind, string> = { photo: "사진", text: "글", file: "파일", audio: "녹음", link: "링크" };

export interface ExtraField {
  key: string;
  label: string;
  required?: boolean;
}

/** 과제형 항목의 세부 과제 (예: 영어 과제 1~4) */
export interface TaskDef {
  id: string;
  name: string;
  description: string;
  kind: "sentences" | "evidence";
  goal: number;
  setIds?: string[]; // sentences: 문장 세트. "{grade}" 는 학년으로 바뀜
  evidence?: EvidenceKind[];
  required?: EvidenceKind[];
  minAudioSec?: number;
  link?: string;
  fields?: ExtraField[];
}

export interface ProgramDef {
  id: ProgramId;
  name: string; // 인증분야 이름 (인증서에 표시)
  area: string; // 영역
  icon: string; // 픽셀 아이콘 이름
  description: string;
  grades: number[];
  enabled: boolean;
  kind: "evidence" | "tasks";
  unit: string;
  // 증빙형
  evidence: EvidenceKind[]; // 올릴 수 있는 증빙
  required: EvidenceKind[]; // 꼭 필요한 증빙
  fields?: ExtraField[]; // 추가 입력칸 (책 제목 등)
  choices?: string[]; // 활동 종류 선택지
  textPrompt?: string;
  minTextLength?: number;
  minAudioSec?: number;
  link?: string; // 외부 사이트 바로가기
  targetByGrade: Record<string, number>; // 학년별 동(인증) 기준
  approval: "auto" | "teacher"; // 자동 인정(이상 시 제외) / 교사 승인 후 인정
  aiReview?: boolean; // AI 사진 1차 확인
  // 과제형
  tasks?: TaskDef[];
  tierTasks?: { bronze: number; silver: number; gold: number }; // 완료 과제 수 기준
  templateId?: string;
}

export interface AppConfig {
  medalMultipliers: { bronze: number; silver: number; gold: number };
  programs: ProgramDef[];
  ai: { enabled: boolean; photoModel: string; teacherModel: string; dailyLimit: number }; // 교사 업무 보조 전용 (학생에게 제공하지 않음)
  certificate: { title: string; issueDate: string; body: string; showSealOnWeb: boolean; sealSizeMm: number };
}

const ALL = [1, 2, 3, 4, 5, 6];
const same = (n: number, grades = ALL) => Object.fromEntries(grades.map((g) => [String(g), n]));

/** 하주초 기본 항목 (새 학교는 템플릿에서 고른다) */
export const HAJU_PROGRAMS: ProgramDef[] = [
  {
    id: "reading", name: "도전! 독서 마라톤", area: "인문", icon: "book", kind: "evidence", enabled: true, grades: ALL, unit: "편",
    description: "책을 읽고 독서기록장에 독후 감상을 적어요. 기록장 1쪽을 성실히 채우면 1편으로 인정해요.",
    evidence: ["photo", "text"], required: ["photo"], fields: [{ key: "bookTitle", label: "책 제목" }],
    textPrompt: "책을 읽고 기억에 남는 점을 짧게 적어도 좋아요.",
    targetByGrade: { "1": 30, "2": 50, "3": 40, "4": 40, "5": 30, "6": 30 }, approval: "teacher", aiReview: true, templateId: "reading-log",
  },
  {
    id: "carbon", name: "탄소중립! 환경 지킴이", area: "봉사", icon: "earth", kind: "evidence", enabled: true, grades: ALL, unit: "회",
    description: "탄소중립·환경 보호 활동을 실천하고 사진과 소감을 올려요. 주 1회 이상 꾸준히!",
    evidence: ["photo", "text"], required: ["photo", "text"], minTextLength: 5,
    choices: ["분리수거", "플로깅", "대중교통·걷기", "다회용기·텀블러", "식물 기르기", "전기·물 아끼기", "잔반 없는 날", "기타"],
    textPrompt: "어떤 실천을 했나요? 느낀 점을 한두 문장으로 적어요.",
    targetByGrade: same(20), approval: "teacher", aiReview: true, templateId: "carbon-neutral",
  },
  {
    id: "english", name: "Speak up in English", area: "외국어", icon: "speech", kind: "tasks", enabled: true, grades: [4, 5, 6], unit: "과제",
    description: "영어 말하기 과제 4개 중 2개 이상을 완료하면 인증이에요.",
    evidence: [], required: [], targetByGrade: same(2, [4, 5, 6]), approval: "teacher",
    tierTasks: { bronze: 2, silver: 3, gold: 4 },
    tasks: [
      { id: "t1", name: "오늘의 카툰 한 문장", kind: "sentences", goal: 30, setIds: ["task1-cartoon"], description: "45문장 중 30문장을 해석 보고 타이핑하고 녹음해요 (3회 반복 후 선생님 검사)." },
      { id: "t2", name: "알공", kind: "evidence", goal: 1, evidence: ["photo"], required: ["photo"], description: "알공 학습을 완료하고 완료 화면을 캡처해서 올려요." },
      { id: "t3", name: "교과서 주요문장", kind: "sentences", goal: 40, setIds: ["task3-grade{grade}"], description: "우리 학년 교과서 주요문장 40개를 해석 보고 타이핑하고 녹음해요." },
      { id: "t4", name: "EBSe 펀리딩 낭독", kind: "evidence", goal: 4, evidence: ["audio"], required: ["audio"], minAudioSec: 120, link: "https://www.ebse.co.kr/apps/funReading/workBook.do", fields: [{ key: "bookTitle", label: "동화책 제목", required: true }], description: "펀리딩 영어 동화책을 2분 이상 소리 내어 읽고 녹음해요 (4권)." },
    ],
  },
];

export const DEFAULT_CONFIG: AppConfig = {
  medalMultipliers: { bronze: 1, silver: 1.5, gold: 2 },
  programs: HAJU_PROGRAMS,
  ai: { enabled: true, photoModel: "claude-haiku-5-5", teacherModel: "claude-sonnet-5-5", dailyLimit: 3000 },
  certificate: {
    title: "학교장 인증서",
    issueDate: "2026년 12월 0일",
    body: "위 학생은 「2026 도전! 꿈 성취 학교장 인증제」에 참가하여 위 분야에서 인증받았기에 이 증서를 드립니다.",
    showSealOnWeb: true,
    sealSizeMm: 24, // 직인 크기: 학교장 이름 마지막 글자에 겹쳐 찍힘
  },
};

/** 저장된 설정(부분)을 기본값과 합친다 */
export function mergeConfig(partial?: Partial<AppConfig> | null): AppConfig {
  if (!partial) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    medalMultipliers: { ...DEFAULT_CONFIG.medalMultipliers, ...partial.medalMultipliers },
    ai: { ...DEFAULT_CONFIG.ai, ...partial.ai },
    certificate: { ...DEFAULT_CONFIG.certificate, ...partial.certificate },
    programs: Array.isArray(partial.programs) ? partial.programs.map(normalizeProgram) : DEFAULT_CONFIG.programs,
  };
}

export function normalizeProgram(p: Partial<ProgramDef> & { id: string }): ProgramDef {
  return {
    name: p.id, area: "자율", icon: "star", description: "", grades: ALL, enabled: true, kind: "evidence", unit: "회",
    evidence: ["photo", "text"], required: ["photo"], targetByGrade: same(10), approval: "teacher",
    ...p,
  } as ProgramDef;
}

export function activePrograms(config: AppConfig, grade?: number) {
  return config.programs.filter((p) => p.enabled && (grade === undefined || p.grades.includes(grade)));
}
export function programById(config: AppConfig, id: string) {
  return config.programs.find((p) => p.id === id);
}

export interface MedalThresholds {
  bronze: number;
  silver: number;
  gold: number;
}

/** 학년별 금은동 기준 (동 = 학교 운영 계획서의 인증 기준) */
export function thresholdsFor(config: AppConfig, program: ProgramDef, grade: number): MedalThresholds | null {
  if (!program.grades.includes(grade)) return null;
  if (program.kind === "tasks") {
    const t = program.tierTasks ?? { bronze: 1, silver: 2, gold: program.tasks?.length ?? 3 };
    return { ...t };
  }
  const base = program.targetByGrade?.[String(grade)];
  if (!base) return null;
  const m = config.medalMultipliers;
  return { bronze: Math.ceil(base * m.bronze), silver: Math.ceil(base * m.silver), gold: Math.ceil(base * m.gold) };
}

export function medalFor(count: number, t: MedalThresholds): Medal {
  if (count >= t.gold) return "gold";
  if (count >= t.silver) return "silver";
  if (count >= t.bronze) return "bronze";
  return "none";
}

export function nextStep(count: number, t: MedalThresholds): { medal: Medal; remaining: number } | null {
  for (const medal of ["bronze", "silver", "gold"] as const) if (count < t[medal]) return { medal, remaining: t[medal] - count };
  return null;
}

export function taskSetIds(task: TaskDef, grade: number) {
  return (task.setIds ?? []).map((s) => s.replace("{grade}", String(grade)));
}

export interface ProgramProgress {
  count: number; // 증빙형: 인정 건수 / 과제형: 완료 과제 수
  medal: Medal;
  thresholds: MedalThresholds;
  tasks?: Record<string, number>; // 과제형: 과제별 진행 수
}
export type StudentProgress = Record<string, ProgramProgress>;

/** counts: 증빙형 = 인정 건수, 과제형 = { 과제ID: 진행 수 } */
export function computeProgress(config: AppConfig, grade: number, counts: Record<string, number | Record<string, number>>): StudentProgress {
  const out: StudentProgress = {};
  for (const p of activePrograms(config, grade)) {
    const t = thresholdsFor(config, p, grade);
    if (!t) continue;
    if (p.kind === "tasks") {
      const raw = (counts[p.id] as Record<string, number>) ?? {};
      const tasks = Object.fromEntries((p.tasks ?? []).map((task) => [task.id, Math.min(raw[task.id] ?? 0, task.goal)]));
      const done = (p.tasks ?? []).filter((task) => (raw[task.id] ?? 0) >= task.goal).length;
      out[p.id] = { count: done, medal: medalFor(done, t), thresholds: t, tasks };
    } else {
      const n = Number(counts[p.id] ?? 0);
      out[p.id] = { count: n, medal: medalFor(n, t), thresholds: t };
    }
  }
  return out;
}

export function isCertified(medal: Medal | undefined) {
  return medal === "bronze" || medal === "silver" || medal === "gold";
}

/** 학생 제출 검증 (화면·서버 공통) */
export function validateEvidence(def: { evidence: EvidenceKind[]; required: EvidenceKind[]; minTextLength?: number; minAudioSec?: number; fields?: ExtraField[]; choices?: string[] }, input: { photo?: boolean; file?: boolean; audioSec?: number; link?: string; text?: string; fields?: Record<string, string>; choice?: string }) {
  for (const k of def.required) {
    if (k === "photo" && !input.photo) return "사진을 넣어 주세요";
    if (k === "file" && !input.file) return "파일을 넣어 주세요";
    if (k === "audio" && !input.audioSec) return "녹음해 주세요";
    if (k === "link" && !input.link?.trim()) return "링크를 넣어 주세요";
    if (k === "text" && !input.text?.trim()) return "소감을 적어 주세요";
  }
  if (def.minTextLength && (input.text?.trim().length ?? 0) < def.minTextLength && def.required.includes("text")) return `소감을 ${def.minTextLength}자 이상 적어 주세요`;
  if (def.minAudioSec && input.audioSec !== undefined && input.audioSec < def.minAudioSec) return `${Math.ceil(def.minAudioSec / 60)}분 이상 녹음해 주세요`;
  if (input.link && !/^https?:\/\//.test(input.link.trim())) return "링크는 http로 시작해야 해요";
  for (const f of def.fields ?? []) if (f.required && !input.fields?.[f.key]?.trim()) return `${f.label}을(를) 적어 주세요`;
  if (def.choices?.length && !input.choice) return "활동 종류를 골라 주세요";
  return null;
}
