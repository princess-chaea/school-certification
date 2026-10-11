// 학생 명단 CSV (학년, 반, [번호], [이름], [이메일]) 파싱·검증
// 이름·이메일은 선택. 둘 다 없으면 번호로 학생을 만들고 담당 교사가 이름을 채운다.

export interface RosterRow {
  grade: number;
  classNo: number;
  number: number;
  name: string; // 없으면 "" (학생 첫 로그인 또는 담당 교사가 입력)
  email: string; // 소문자, 없으면 ""
}

export interface RosterParseResult {
  rows: RosterRow[];
  errors: string[];
}

export const ROSTER_TEMPLATE = "﻿학년,반,번호,이름,이메일\n3,1,1,홍길동,263101@haju.es.kr\n3,1,2,,263102@haju.es.kr\n1,1,1,이하늘,\n1,1,2,,\n";

/** 따옴표·쉼표를 처리하는 간단한 CSV 파서 */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === "," || ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
}

const HEADER_ALIASES: Record<string, keyof RosterRow> = {
  학년: "grade", grade: "grade",
  반: "classNo", class: "classNo", 학급: "classNo",
  번호: "number", number: "number", 출석번호: "number",
  이름: "name", 성명: "name", name: "name", 학생명: "name",
  이메일: "email", email: "email", 계정: "email", 아이디: "email", 구글계정: "email",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** CSV 텍스트 → 명단. 번호가 없으면 반별 이름순으로 1번부터 부여 */
export function parseRosterCsv(text: string, emailDomainForIdOnly?: string): RosterParseResult {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (!table.length) return { rows: [], errors: ["내용이 비어 있어요."] };
  const header = table[0].map((h) => HEADER_ALIASES[h.replace(/\s/g, "").toLowerCase()] ?? HEADER_ALIASES[h.replace(/\s/g, "")]);
  const col = (k: keyof RosterRow) => header.indexOf(k);
  for (const k of ["grade", "classNo"] as const) {
    if (col(k) < 0) errors.push(`'${k === "grade" ? "학년" : "반"}' 열이 없어요. 첫 줄은 학년,반,번호,이름,이메일 이어야 해요.`);
  }
  if (col("name") < 0 && col("email") < 0 && col("number") < 0) errors.push("'번호', '이름', '이메일' 중 한 열이 있어야 해요. 첫 줄은 학년,반,번호,이름,이메일 이어야 해요.");
  if (errors.length) return { rows: [], errors };

  const rows: RosterRow[] = [];
  const seenEmail = new Map<string, number>();
  const seenNumber = new Map<string, number>();
  const numericCell = (value: string, suffix: string) => new RegExp(`^\\d+(?:${suffix})?$`).test(value.trim()) ? Number(value.replace(/[^0-9]/g, "")) : NaN;
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const grade = numericCell(r[col("grade")] ?? "", "학년");
    const classNo = numericCell(r[col("classNo")] ?? "", "반");
    const name = col("name") >= 0 ? (r[col("name")] ?? "").trim() : "";
    let email = col("email") >= 0 ? (r[col("email")] ?? "").trim().toLowerCase() : "";
    if (email && !email.includes("@") && emailDomainForIdOnly) email = `${email}@${emailDomainForIdOnly}`;
    const rawNumber = col("number") >= 0 ? (r[col("number")] ?? "").trim() : "";
    const number = rawNumber ? numericCell(rawNumber, "번") : 0;
    if (!(grade >= 1 && grade <= 6)) return void errors.push(`${line}번째 줄: 학년이 올바르지 않아요.`);
    if (!(classNo >= 1 && classNo <= 20)) return void errors.push(`${line}번째 줄: 반이 올바르지 않아요.`);
    if (rawNumber && (!Number.isSafeInteger(number) || number < 1)) return void errors.push(`${line}번째 줄: 번호는 양의 정수로 입력해 주세요.`);
    if (!name && !email && !number) return void errors.push(`${line}번째 줄: 이름과 이메일이 없으면 번호를 입력해 주세요.`);
    if (name.length > 30) return void errors.push(`${line}번째 줄: 이름은 30자 이내로 입력해 주세요.`);
    const key = `${grade}-${classNo}-${number}`;
    if (number && seenNumber.has(key)) return void errors.push(`${line}번째 줄: 학년·반·번호가 ${seenNumber.get(key)}번째 줄과 겹쳐요.`);
    if (email && !EMAIL_RE.test(email)) return void errors.push(`${line}번째 줄: 이메일 형식이 올바르지 않아요 (${email}).`);
    if (email && seenEmail.has(email)) return void errors.push(`${line}번째 줄: 이메일이 ${seenEmail.get(email)}번째 줄과 겹쳐요.`);
    if (number) seenNumber.set(key, line);
    if (email) seenEmail.set(email, line);
    rows.push({ grade, classNo, number, name, email });
  });

  // 번호 자동 부여 (반별 이름순)
  const byClass = new Map<string, RosterRow[]>();
  rows.forEach((r) => {
    const k = `${r.grade}-${r.classNo}`;
    byClass.set(k, [...(byClass.get(k) ?? []), r]);
  });
  for (const list of byClass.values()) {
    if (list.some((r) => !r.number)) {
      const used = new Set(list.filter((r) => r.number).map((r) => r.number));
      let n = 1;
      [...list].filter((r) => !r.number).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "ko")).forEach((r) => {
        while (used.has(n)) n++;
        r.number = n;
        used.add(n);
      });
    }
  }
  return { rows, errors };
}

/** 학생 문서 ID: 계정이 있으면 이메일, 없으면 학년도-학년-반-번호 */
export function studentIdFor(row: Pick<RosterRow, "email" | "grade" | "classNo" | "number">, year: number) {
  return row.email ? row.email.toLowerCase() : `nomail-${year}-${row.grade}-${row.classNo}-${String(row.number).padStart(2, "0")}`;
}

export function englishItemId(year: number, sid: string, setId: string, no: number) {
  return `${year}_${sid}_${setId}_${no}`;
}


/** 서버에서도 CSV 외 직접 호출을 동일하게 검증한다. 오류가 있으면 쓰기 전에 전체 거절. */
export function validateRosterRows(value: unknown): RosterRow[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3000) throw new Error("학생은 1~3000명까지 올릴 수 있어요.");
  const emails = new Set<string>();
  const identities = new Set<string>();
  return value.map((row: unknown) => {
    if (!row || typeof row !== "object") throw new Error("학생 정보를 확인해 주세요.");
    const r = row as Record<string, unknown>;
    if (!Number.isInteger(r.grade) || Number(r.grade) < 1 || Number(r.grade) > 6 || !Number.isInteger(r.classNo) || Number(r.classNo) < 1 || Number(r.classNo) > 20 || !Number.isSafeInteger(r.number) || Number(r.number) < 1) throw new Error("학년·반·번호는 올바른 양의 정수여야 해요.");
    if ((r.name != null && typeof r.name !== "string") || (r.email != null && typeof r.email !== "string")) throw new Error("이름·이메일 형식을 확인해 주세요.");
    const name = (r.name as string | undefined ?? "").trim();
    const email = (r.email as string | undefined ?? "").trim().toLowerCase();
    if (name.length > 30 || (email && (!EMAIL_RE.test(email) || email.length > 254 || email.includes("/")))) throw new Error("이름은 30자 이내, 이메일은 올바른 형식으로 입력해 주세요.");
    const key = `${r.grade}-${r.classNo}-${r.number}`;
    if (identities.has(key) || (email && emails.has(email))) throw new Error("학년·반·번호 또는 이메일이 중복되었어요.");
    identities.add(key);
    if (email) emails.add(email);
    return { grade: r.grade as number, classNo: r.classNo as number, number: r.number as number, name, email };
  });
}

export interface NameUpdateRow {
  sid: string;
  grade: number;
  classNo: number;
  number: number;
  name: string;
}

export function validateNameUpdateRows(value: unknown, grade: unknown, classNo: unknown): NameUpdateRow[] {
  if (!Number.isInteger(grade) || Number(grade) < 1 || Number(grade) > 6 || (classNo != null && (!Number.isInteger(classNo) || Number(classNo) < 1 || Number(classNo) > 20))) throw new Error("대상 학년·반을 확인해 주세요.");
  if (!Array.isArray(value) || value.length < 1 || value.length > 400) throw new Error("이름은 한 번에 1~400명까지 변경할 수 있어요.");
  const seen = new Set<string>();
  return value.map((row: unknown) => {
    if (!row || typeof row !== "object") throw new Error("학생 정보를 확인해 주세요.");
    const r = row as Record<string, unknown>;
    if (typeof r.sid !== "string" || !r.sid || r.sid !== r.sid.trim() || r.sid.length > 254 || r.sid.includes("/") || r.sid === "." || r.sid === ".." || seen.has(r.sid)) throw new Error("학생 식별자가 잘못되었거나 중복되었어요.");
    if (r.grade !== grade || (classNo != null && r.classNo !== classNo) || !Number.isInteger(r.classNo) || Number(r.classNo) < 1 || Number(r.classNo) > 20 || !Number.isSafeInteger(r.number) || Number(r.number) < 1) throw new Error("내려받은 학년·반·번호를 변경하지 마세요.");
    if (typeof r.name !== "string" || !r.name.trim() || r.name.trim().length > 30 || /[\r\n\u0000]/.test(r.name)) throw new Error("이름을 1~30자로 입력해 주세요.");
    seen.add(r.sid);
    return { sid: r.sid, grade: r.grade as number, classNo: r.classNo as number, number: r.number as number, name: r.name.trim() };
  });
}

type NameEditingStaff = { role: string; status: string; homeroom?: boolean; grade?: number | null; classNo?: number | null; subject?: boolean; grades?: number[]; subjectClasses?: { grade: number; classNo: number }[] };
export function canUpdateClassStudentNames(staff: NameEditingStaff, grade: number, classNo: number): boolean {
  return staff.status === "active" && (staff.role === "admin" || (staff.role === "teacher" && (
    (staff.homeroom === true && staff.grade === grade && staff.classNo === classNo) ||
    (staff.subject === true && Array.isArray(staff.grades) && staff.grades.includes(grade) && (staff.subjectClasses === undefined || (Array.isArray(staff.subjectClasses) && (staff.subjectClasses.length === 0 || staff.subjectClasses.some((item) => item !== null && typeof item === "object" && item.grade === grade && item.classNo === classNo)))))
  )));
}
