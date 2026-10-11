import { parseCsv } from "../../shared/roster";

export interface NameRosterStudent {
  id: string;
  grade: number;
  classNo: number;
  number: number;
  name: string;
}
export interface NameRosterUpdate {
  sid: string;
  grade: number;
  classNo: number;
  number: number;
  name: string;
}
export const NAME_ROSTER_LIMIT = 400;
const HEADER = ["학생ID", "학년", "반", "번호", "이름"];
// Spreadsheets may ignore leading whitespace/control characters before a formula.
const formula = /^[\s\u0000-\u001f]*[=+@-]/;
const csvCell = (value: string | number) => {
  const text = String(value);
  const safe = formula.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
const unescapeCell = (value: string) => value.startsWith("'") && formula.test(value.slice(1)) ? value.slice(1) : value;

export function decodeNameRosterCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder("euc-kr", { fatal: true }).decode(buffer);
    } catch {
      throw new Error("CSV 글자 인코딩을 읽을 수 없어요. CSV UTF-8로 다시 저장해 주세요.");
    }
  }
}

export function createNameRosterCsv(students: NameRosterStudent[]): string {
  return "\uFEFF" + [HEADER.join(","), ...students.map((s) =>
    [s.id, s.grade, s.classNo, s.number, s.name].map(csvCell).join(","),
  )].join("\r\n") + "\r\n";
}

/** Every row is checked before returning updates, including blank and unchanged names. */
export function parseNameRosterCsv(text: string, students: NameRosterStudent[]) {
  // The shared parser is permissive; reject broken quoting before using its cells.
  let state: "start" | "plain" | "quoted" | "closed" = "start";
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (state === "quoted") {
      if (ch === '"' && source[i + 1] === '"') i++;
      else if (ch === '"') state = "closed";
    } else if (ch === "," || ch === "\t" || ch === "\r" || ch === "\n") state = "start";
    else if (ch === '"' && state === "start") state = "quoted";
    else if (ch === '"' || (state === "closed" && ch !== " ")) throw new Error("CSV 따옴표 형식이 올바르지 않아요. CSV 형식으로 다시 저장해 주세요.");
    else if (state !== "closed") state = "plain";
  }
  if (state === "quoted") throw new Error("CSV 따옴표가 닫히지 않았어요. CSV 형식으로 다시 저장해 주세요.");
  const table = parseCsv(text);
  if (!table.length || table[0].length !== HEADER.length || table[0].some((v, i) => v !== HEADER[i])) {
    throw new Error("학생ID, 학년, 반, 번호, 이름 열이 필요해요. 현황에서 내려받은 CSV의 첫 줄을 그대로 유지하세요.");
  }
  if (table.length === 1) throw new Error("학생 행이 없어요. 현재 명단을 다시 내려받아 주세요.");
  if (table.length - 1 > NAME_ROSTER_LIMIT) throw new Error("한 번에 400명까지 입력할 수 있어요. 반을 선택해 명단을 내려받아 주세요.");
  const visible = new Map(students.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const rows: NameRosterUpdate[] = [];
  let unchanged = 0;
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    if (cells.length !== HEADER.length) throw new Error(`${line}번째 줄: 열 개수가 달라요. 이름 칸만 수정해 주세요.`);
    const [rawId, grade, classNo, number, rawName] = cells;
    const sid = unescapeCell(rawId);
    if (seen.has(sid)) throw new Error(`${line}번째 줄: 같은 학생이 두 번 들어 있어요.`);
    seen.add(sid);
    const student = visible.get(sid);
    if (!student) throw new Error(`${line}번째 줄: 현재 화면의 학생이 아니에요. 내려받았던 학년·반을 선택하거나 CSV를 다시 내려받아 주세요.`);
    if ([grade, classNo, number].some((v) => !/^\d+$/.test(v)) || Number(grade) !== student.grade || Number(classNo) !== student.classNo || Number(number) !== student.number) {
      throw new Error(`${line}번째 줄: 학년·반·번호가 현재 명단과 달라요. 이름 칸만 수정해 주세요.`);
    }
    const name = unescapeCell(rawName).trim();
    if (name.length > 30 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error(`${line}번째 줄: 이름은 줄바꿈 없이 30자 이내로 적어 주세요.`);
    if (!name || name === student.name) { unchanged++; return; }
    rows.push({ sid, grade: student.grade, classNo: student.classNo, number: student.number, name });
  });
  return { rows, unchanged };
}
