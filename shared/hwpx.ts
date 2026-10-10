// 학교장 인증서 한글(hwpx) 양식에 학생 정보를 채워 여러 쪽짜리 문서 한 개로 만든다.
// 양식의 자리표시: 인증분야 {} / {}학년 {}반 / 홍길동(이름) / {}년 {}월 {}일
import { unzipSync, zipSync, strFromU8, strToU8, type Zippable } from "fflate";

export interface CertRow {
  field: string; // 인증분야 이름
  grade: number;
  classNo: number;
  name: string;
}

export interface CertOptions {
  date: [string, string, string]; // 년, 월, 일
  schoolName?: string; // 양식의 "하주초등학교"를 바꿀 때
  principalTitle?: string; // 양식의 "하주초등학교장 문석주"를 바꿀 때
  year?: number; // 본문 「2026 도전! ...」 학년도
  seal?: Uint8Array | null; // 직인 이미지(jpg). null 이면 직인 제거, undefined 면 양식 그대로
}

const TEMPLATE_SCHOOL = "하주초등학교";
const TEMPLATE_PRINCIPAL = "하주초등학교장 문석주";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 한 쪽(문단) XML 에 학생 정보를 채운다 */
function fillPage(page: string, row: CertRow, opt: CertOptions) {
  let p = page;
  p = p.replace("<hp:t>{}</hp:t>", `<hp:t>${esc(row.field)}</hp:t>`);
  p = p.replace("<hp:t>{}학년 {}반</hp:t>", `<hp:t>${row.grade}학년 ${row.classNo}반</hp:t>`);
  p = p.replace("<hp:t>홍길동</hp:t>", `<hp:t>${esc(row.name)}</hp:t>`);
  p = p.replace("<hp:t>{}년 {}월 {}일</hp:t>", `<hp:t>${esc(opt.date[0])}년 ${esc(opt.date[1])}월 ${esc(opt.date[2])}일</hp:t>`);
  if (opt.principalTitle) p = p.split(`<hp:t>${TEMPLATE_PRINCIPAL}</hp:t>`).join(`<hp:t>${esc(opt.principalTitle)}</hp:t>`);
  if (opt.schoolName) p = p.split(`<hp:t>${TEMPLATE_SCHOOL}</hp:t>`).join(`<hp:t>${esc(opt.schoolName)}</hp:t>`);
  if (opt.year) p = p.replace(/「\d{4} 도전!/, `「${opt.year} 도전!`);
  if (opt.seal === null) p = p.replace(/<hp:pic\b(?:(?!<hp:pic\b)[\s\S])*?binaryItemIDRef="image2"[\s\S]*?<\/hp:pic>/, "");
  return p;
}

/** 두 번째 쪽부터: 구역 설정(secPr) 제거, 쪽 나눔, 개체 ID 를 겹치지 않게 */
function asNextPage(page: string, k: number) {
  let p = page.replace(/<hp:run charPrIDRef="\d+"><hp:secPr\b[\s\S]*?<\/hp:secPr>\s*<hp:ctrl>\s*<hp:colPr\b[^>]*\/>\s*<\/hp:ctrl>\s*<\/hp:run>/, "");
  p = p.replace(/^<hp:p ([^>]*?)pageBreak="0"/, '<hp:p $1pageBreak="1"');
  const shift = (n: string) => String(Number(n) + k * 1000);
  p = p.replace(/(<hp:(?:pic|tbl|fieldBegin)\b[^>]*?\bid=")(\d{6,})"/g, (_m, a: string, n: string) => `${a}${shift(n)}"`);
  p = p.replace(/(\binstid=")(\d{6,})"/g, (_m, a: string, n: string) => `${a}${shift(n)}"`);
  p = p.replace(/(\bbeginIDRef=")(\d{6,})"/g, (_m, a: string, n: string) => `${a}${shift(n)}"`);
  return p;
}

export function buildCertificatesHwpx(template: Uint8Array, rows: CertRow[], opt: CertOptions): Uint8Array {
  if (!rows.length) throw new Error("인증서를 만들 학생이 없어요.");
  const files = unzipSync(template);
  const secName = "Contents/section0.xml";
  const xml = strFromU8(files[secName]);
  const open = xml.indexOf(">", xml.indexOf("<hs:sec")) + 1;
  const close = xml.lastIndexOf("</hs:sec>");
  if (open <= 0 || close < 0) throw new Error("양식(section0.xml)을 읽지 못했어요.");
  const head = xml.slice(0, open);
  const page = xml.slice(open, close).trim();
  const body = rows.map((r, k) => (k === 0 ? fillPage(page, r, opt) : asNextPage(fillPage(page, r, opt), k))).join("");
  files[secName] = strToU8(head + body + "</hs:sec>");
  if (opt.seal) files["BinData/image2.jpg"] = opt.seal;
  // 미리보기 이미지·텍스트는 첫 학생 기준이 아니므로 제거
  delete files["Preview/PrvImage.png"];
  delete files["Preview/PrvText.txt"];

  const out: Zippable = {};
  out["mimetype"] = [files["mimetype"], { level: 0 }];
  for (const [name, data] of Object.entries(files)) if (name !== "mimetype") out[name] = data;
  return zipSync(out, { level: 6 });
}
