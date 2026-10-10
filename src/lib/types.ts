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
}

export interface SentenceSet {
  setId: string;
  title: string;
  grades: number[];
  goal: number;
  items: SentenceItem[];
}

export type { Medal, ProgramId };
