// 학교장 인증서 한글(hwpx) 양식에 학생 정보를 채워 여러 쪽짜리 문서 한 개로 만든다.
// 양식의 자리표시: 인증분야 {} / {}초등학교 / {}학년 {}반 / {이름} / {}년 {}월 {}일 / {}초등학교장 {학교장명}
// 양식은 두 가지: 테두리 있는 것(학교장 인증서.hwpx), 상장 용지에 인쇄할 테두리 없는 것(학교장 인증서(테두리X).hwpx)
// 직인은 양식에 넣지 않고, 학교 담당자가 등록한 직인을 학교장 이름 마지막 글자에 겹쳐서 크게 찍는다.
import { unzipSync, zipSync, strFromU8, strToU8, type Zippable } from "fflate";

export interface CertRow {
  field: string; // 인증분야 이름
  grade: number;
  classNo: number;
  name: string;
}

export interface SealImage {
  data: Uint8Array;
  type: "image/png" | "image/jpeg";
}

export interface CertOptions {
  date: [string, string, string]; // 년, 월, 일
  schoolName: string; // 예: 하주초등학교
  principalTitle: string; // 예: 하주초등학교장 문석주
  year?: number; // 본문 「2026 도전! ...」 학년도
  seal?: SealImage | null; // 학교 담당자가 등록한 직인. 없으면 직인 없이
  sealSizeMm?: number; // 직인 한 변 길이 (기본 24mm)
}

const MM = 283.465; // 1mm = 283.465 HWPUNIT
const U32 = 2 ** 32;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 한 쪽(문단들) XML 에 학생 정보를 채운다 */
function fillPage(page: string, row: CertRow, opt: CertOptions, sealPic: string) {
  const t = (s: string) => `<hp:t>${esc(s)}</hp:t>`;
  let p = page;
  p = p.replace("<hp:t>{}</hp:t>", t(row.field));
  p = p.replace("<hp:t>{}초등학교</hp:t>", t(opt.schoolName));
  p = p.replace("<hp:t>{}학년 {}반</hp:t>", t(`${row.grade}학년 ${row.classNo}반`));
  p = p.replace("<hp:t>{이름}</hp:t>", t(row.name));
  p = p.replace("<hp:t>{}년 {}월 {}일</hp:t>", t(`${opt.date[0]}년 ${opt.date[1]}월 ${opt.date[2]}일`));
  p = p.replace("<hp:t>{}초등학교장 {학교장명}</hp:t>", sealPic + t(opt.principalTitle));
  if (opt.year) p = p.replace(/「\d{4} 도전!/, `「${opt.year} 도전!`);
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

/** PNG·JPEG 머리에서 가로·세로 픽셀 */
export function imageSize(b: Uint8Array): { w: number; h: number } | null {
  if (b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { w: (b[i + 7] << 8) | b[i + 8], h: (b[i + 5] << 8) | b[i + 6] };
      i += 2 + len;
    }
  }
  return null;
}

interface TextLayout {
  column: number; // 본문 폭
  advance: number; // 한글 한 글자 폭
  space: number; // 띄어쓰기 폭
  lineHeight: number; // 글자 높이
  align: string; // CENTER | LEFT | RIGHT
}

/** 학교장 줄의 글자 모양(크기·장평·자간)과 문단 정렬을 양식에서 읽는다 */
function principalLayout(section: string, header: string): TextLayout {
  const i = section.indexOf("{}초등학교장 {학교장명}");
  const para = section.slice(section.lastIndexOf("<hp:p ", i), section.indexOf("</hp:p>", i));
  const column = Number(/horzsize="(\d+)"/.exec(para)?.[1] ?? 46604);
  const paraPr = /paraPrIDRef="(\d+)"/.exec(para)?.[1];
  const charPr = [...para.slice(0, para.indexOf("{}초등학교장")).matchAll(/charPrIDRef="(\d+)"/g)].pop()?.[1];
  const align = new RegExp(`<hh:paraPr id="${paraPr}"[\\s\\S]*?<hh:align horizontal="(\\w+)"`).exec(header)?.[1] ?? "CENTER";
  const cp = new RegExp(`<hh:charPr id="${charPr}"[\\s\\S]*?</hh:charPr>`).exec(header)?.[0] ?? "";
  const height = Number(/height="(\d+)"/.exec(cp)?.[1] ?? 3000);
  const ratio = Number(/<hh:ratio hangul="(-?\d+)"/.exec(cp)?.[1] ?? 100) / 100;
  const spacing = Number(/<hh:spacing hangul="(-?\d+)"/.exec(cp)?.[1] ?? 0) / 100;
  const advance = height * ratio * (1 + spacing);
  return { column, advance, space: height * ratio * (0.5 + spacing), lineHeight: height, align };
}

/** 직인 그림: 학교장 줄에 붙이고, 이름 마지막 글자 한가운데에 직인 가운데가 오도록 (글 뒤로 → 이름이 직인 위에 보임) */
function sealPicXml(principal: string, layout: TextLayout, img: { w: number; h: number }, sizeMm: number) {
  const chars = [...principal];
  const width = chars.reduce((sum, c) => sum + (c === " " ? layout.space : layout.advance), 0);
  const start = layout.align === "LEFT" ? 0 : layout.align === "RIGHT" ? layout.column - width : (layout.column - width) / 2;
  const lastCenter = start + width - layout.advance / 2;
  const size = Math.round(sizeMm * MM);
  const w = img.w >= img.h ? size : Math.round((size * img.w) / img.h);
  const h = img.h >= img.w ? size : Math.round((size * img.h) / img.w);
  const x = Math.round(lastCenter - w / 2);
  const y = Math.round(layout.lineHeight / 2 - h / 2);
  const u = (n: number) => String(n < 0 ? U32 + n : n);
  const ow = img.w * 75, oh = img.h * 75;
  return (
    `<hp:pic id="1900000001" zOrder="5" numberingType="PICTURE" textWrap="BEHIND_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="1900000002" reverse="0">` +
    `<hp:offset x="0" y="0"/><hp:orgSz width="${ow}" height="${oh}"/><hp:curSz width="${w}" height="${h}"/><hp:flip horizontal="0" vertical="0"/>` +
    `<hp:rotationInfo angle="0" centerX="${Math.round(w / 2)}" centerY="${Math.round(h / 2)}" rotateimage="1"/>` +
    `<hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="${(w / ow).toFixed(6)}" e2="0" e3="0" e4="0" e5="${(h / oh).toFixed(6)}" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>` +
    `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${ow}" y="0"/><hc:pt2 x="${ow}" y="${oh}"/><hc:pt3 x="0" y="${oh}"/></hp:imgRect>` +
    `<hp:imgClip left="0" right="${ow}" top="0" bottom="${oh}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>` +
    `<hc:img binaryItemIDRef="schoolseal" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/>` +
    `<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="${u(y)}" horzOffset="${u(x)}"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>학교 직인</hp:shapeComment></hp:pic>`
  );
}

export function buildCertificatesHwpx(template: Uint8Array, rows: CertRow[], opt: CertOptions): Uint8Array {
  if (!rows.length) throw new Error("인증서를 만들 학생이 없어요.");
  const files = unzipSync(template);
  const secName = "Contents/section0.xml";
  const xml = strFromU8(files[secName]);
  const open = xml.indexOf(">", xml.indexOf("<hs:sec")) + 1;
  const close = xml.lastIndexOf("</hs:sec>");
  if (open <= 0 || close < 0) throw new Error("양식(section0.xml)을 읽지 못했어요.");
  if (!xml.includes("{}초등학교장 {학교장명}")) throw new Error("양식에서 학교장 자리({}초등학교장 {학교장명})를 찾지 못했어요.");

  let sealPic = "";
  const size = opt.seal ? imageSize(opt.seal.data) : null;
  if (opt.seal && size) {
    const ext = opt.seal.type === "image/png" ? "png" : "jpg";
    const href = `BinData/schoolseal.${ext}`;
    files[href] = opt.seal.data;
    const hpf = strFromU8(files["Contents/content.hpf"]);
    files["Contents/content.hpf"] = strToU8(hpf.replace("</opf:manifest>", `<opf:item id="schoolseal" href="${href}" media-type="${opt.seal.type}" isEmbeded="1"/></opf:manifest>`));
    sealPic = sealPicXml(opt.principalTitle, principalLayout(xml, strFromU8(files["Contents/header.xml"])), size, opt.sealSizeMm ?? 24);
  }

  const head = xml.slice(0, open);
  const page = xml.slice(open, close).trim();
  const body = rows.map((r, k) => (k === 0 ? fillPage(page, r, opt, sealPic) : asNextPage(fillPage(page, r, opt, sealPic), k))).join("");
  files[secName] = strToU8(head + body + "</hs:sec>");
  // 미리보기 이미지·텍스트는 첫 학생 기준이 아니므로 제거
  delete files["Preview/PrvImage.png"];
  delete files["Preview/PrvText.txt"];

  const out: Zippable = {};
  out["mimetype"] = [files["mimetype"], { level: 0 }];
  for (const [name, data] of Object.entries(files)) if (name !== "mimetype") out[name] = data;
  return zipSync(out, { level: 6 });
}
