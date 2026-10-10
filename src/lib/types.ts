import type { Timestamp } from "firebase/firestore";
import type { Medal, ProgramId, StudentProgress, EnglishTaskId } from "../../shared/domain";

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

export interface StaffDoc {
  uid: string;
  role: "teacher" | "admin";
  status: "pending" | "active" | "rejected";
  name: string;
  email: string;
  teacherType: "homeroom" | "subject";
  grade?: number;
  classNo?: number;
  grades?: number[];
  programs?: ProgramId[];
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
  activityDate?: string;
  grade: number;
  classNo: number;
  program: ProgramId;
  task?: EnglishTaskId;
  photoPath?: string;
  audioPath?: string;
  durationSec?: number;
  bookTitle?: string;
  text?: string;
  activityType?: string;
  createdAt?: Timestamp;
  status: "active" | "deleted";
  source: "student" | "teacher";
  count: number;
  createdByName?: string;
  deleteReason?: string;
  deletedBy?: string;
  ai?: AiReview;
  isDemo?: boolean;
  studentName?: string;
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
  setId: string;
  task: "t1" | "t3";
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
