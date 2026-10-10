// 학생 명단 CSV (학년, 반, [번호], 이름, 이메일) 파싱·검증

export interface RosterRow {
  grade: number;
  classNo: number;
  number: number;
  name: string;
  email: string; // 소문자, 없으면 ""
}

export interface RosterParseResult {
  rows: RosterRow[];
  errors: string[];
}

export const ROSTER_TEMPLATE = "﻿학년,반,번호,이름,이메일\n3,1,1,홍길동,263101@haju.es.kr\n3,1,2,김하주,263102@haju.es.kr\n1,1,1,이하늘,\n";

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
  for (const k of ["grade", "classNo", "name"] as const) {
    if (col(k) < 0) errors.push(`'${k === "grade" ? "학년" : k === "classNo" ? "반" : "이름"}' 열이 없어요. 첫 줄은 학년,반,이름,이메일 이어야 해요.`);
  }
  if (errors.length) return { rows: [], errors };

  const rows: RosterRow[] = [];
  const seenEmail = new Map<string, number>();
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const grade = Number(String(r[col("grade")] ?? "").replace(/[^0-9]/g, ""));
    const classNo = Number(String(r[col("classNo")] ?? "").replace(/[^0-9]/g, ""));
    const name = (r[col("name")] ?? "").trim();
    let email = col("email") >= 0 ? (r[col("email")] ?? "").trim().toLowerCase() : "";
    if (email && !email.includes("@") && emailDomainForIdOnly) email = `${email}@${emailDomainForIdOnly}`;
    const number = col("number") >= 0 ? Number(String(r[col("number")] ?? "").replace(/[^0-9]/g, "")) || 0 : 0;
    if (!(grade >= 1 && grade <= 6)) return void errors.push(`${line}번째 줄: 학년이 올바르지 않아요.`);
    if (!(classNo >= 1 && classNo <= 20)) return void errors.push(`${line}번째 줄: 반이 올바르지 않아요.`);
    if (!name) return void errors.push(`${line}번째 줄: 이름이 비어 있어요.`);
    if (email && !EMAIL_RE.test(email)) return void errors.push(`${line}번째 줄: 이메일 형식이 올바르지 않아요 (${email}).`);
    if (email && seenEmail.has(email)) return void errors.push(`${line}번째 줄: 이메일이 ${seenEmail.get(email)}번째 줄과 겹쳐요.`);
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
      [...list].filter((r) => !r.number).sort((a, b) => a.name.localeCompare(b.name, "ko")).forEach((r) => {
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
