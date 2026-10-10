import type { Timestamp } from "firebase/firestore";
import type { Medal, ProgramId, StudentProgress } from "../../shared/domain";

export interface StudentDoc {
  sid: string;
  email: string;
  year: number;
  grade: number;
  classNo: number;
  number: number;
  name: string;
  active: boolean;
  hasAccount: boolean;
  isDemo?: boolean;
  progress?: StudentProgress;
  lastLoginAt?: Timestamp;
  feedback?: string; // 선생님 한마디 (학생 홈에 표시)
  feedbackByName?: string;
  feedbackAt?: Timestamp;
}

/** 교사·학교 담당자 (역할은 겹칠 수 있음) */
export interface StaffDoc {
  uid: string;
  role: "teacher" | "admin"; // admin = 학교 담당자
  status: "pending" | "active" | "rejected";
  name: string;
  email: string;
  homeroom?: boolean;
  grade?: number | null;
  classNo?: number | null;
  subject?: boolean;
  grades?: number[];
  programs?: string[];
  requestedAdmin?: boolean;
  createdAt?: Timestamp;
}

export interface AiReview {
  verdict: "ok" | "check" | "reject";
  reason: string;
  feedback?: string;
  question?: string | null;
  bookTitle?: string | null;
  activityType?: string | null;
  model?: string;
}

export interface Submission {
  id: string;
  sid: string;
  year: number;
  grade: number;
  classNo: number;
  program: ProgramId;
  task?: string;
  activityDate?: string;
  photoPath?: string;
  filePath?: string;
  fileName?: string;
  audioPath?: string;
  durationSec?: number;
  audioCheck?: { durationSec: number; voicedRatio: number };
  link?: string;
  text?: string;
  activityType?: string;
  fields?: Record<string, string>;
  createdAt?: Timestamp;
  status: "pending" | "active" | "deleted";
  source: "student" | "teacher";
  count: number;
  createdByName?: string;
  reviewedByName?: string;
  deleteReason?: string;
  deletedBy?: string;
  isDemo?: boolean;
}

export interface EnglishRound {
  typedOk: boolean;
  attempts: number;
  audioPath?: string;
  durationMs?: number;
  sttText?: string;
  at?: number;
}

export type EnglishStatus = "new" | "practicing" | "ready" | "requested" | "checked" | "retry";

export interface EnglishItem {
  id: string;
  sid: string;
  year: number;
  grade: number;
  classNo: number;
  program: string;
  setId: string;
  task: string;
  no: number;
  custom?: { en: string; ko: string };
  rounds: EnglishRound[];
  status: EnglishStatus;
  requestedAt?: Timestamp;
  checkedByName?: string;
  checkedAt?: Timestamp;
  teacherNote?: string;
  isDemo?: boolean;
}

export interface SentenceItem {
  no: number;
  unit?: number;
  type?: "fixed" | "student";
  en: string;
  ko: string;
  koStatus?: "draft" | "approved";
  alternatives?: string[];
  prompt?: string;
  video?: string; // 이 문장을 다루는 영상(차시) 링크
}

export interface SentenceSet {
  setId: string;
  title: string;
  grades: number[];
  goal: number;
  items: SentenceItem[];
  itemLabel?: string; // 문장 번호 대신 쓰는 이름 (예: "Day")
  videoName?: string; // 영상 강좌 이름 (예: EBSe 카툰 잉글리시 2.0)
  videoListUrl?: string; // 차시별 링크가 없을 때 여는 강좌 목록
}

export type { Medal, ProgramId };
