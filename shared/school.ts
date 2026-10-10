// 학교 정보 (NEIS 학교 기본정보로 개설) — 다른 학교도 같은 앱을 쓸 수 있도록 설정으로 분리

export interface SchoolInfo {
  name: string; // 하주초등학교
  shortName: string; // 하주초
  principalName: string; // 문석주
  studentDomain: string; // haju.es.kr (학생 구글 계정 도메인)
  year: number;
  logoUrl: string; // 공개 URL 또는 /logo.png
  sealUrl: string; // 직인 이미지
  neis?: NeisSchool;
  joinPolicy?: "open" | "approval";
  setupAt?: unknown;
}

export interface NeisSchool {
  atptCode: string; // 시도교육청코드
  atptName: string;
  schoolCode: string; // 표준학교코드
  name: string;
  kind: string; // 초등학교
  region: string; // 경상북도
  jurisdiction: string; // 관할 교육지원청
  address: string;
  tel?: string;
  homepage?: string;
}

export const DEFAULT_SCHOOL: SchoolInfo = {
  name: "하주초등학교",
  shortName: "하주초",
  principalName: "문석주",
  studentDomain: "haju.es.kr",
  year: 2026,
  logoUrl: "/logo.png",
  sealUrl: "/cert/seal.jpg",
};

/** 하주초등학교 → 하주초, 경산중학교 → 경산중, 구미고등학교 → 구미고 */
export function shortSchoolName(name: string) {
  return name.replace(/초등학교$/, "초").replace(/중학교$/, "중").replace(/고등학교$/, "고");
}

export function mergeSchool(partial?: Partial<SchoolInfo> | null): SchoolInfo {
  const s = { ...DEFAULT_SCHOOL, ...(partial ?? {}) };
  if (!partial?.shortName && partial?.name) s.shortName = shortSchoolName(partial.name);
  // 새로 개설한 학교는 로고·직인·학교장을 아직 비워 둘 수 있다 (하주초 기본값을 쓰지 않음)
  if (partial && partial.name && partial.name !== DEFAULT_SCHOOL.name) {
    s.logoUrl = partial.logoUrl ?? "";
    s.sealUrl = partial.sealUrl ?? "";
    s.principalName = partial.principalName ?? "";
  }
  return s;
}

export function principalTitle(s: SchoolInfo) {
  return `${s.name}장 ${s.principalName}`;
}

/** NEIS 학교기본정보(schoolInfo) JSON 응답 → 목록 */
export function parseNeisSchoolInfo(json: unknown): NeisSchool[] {
  const root = (json as { schoolInfo?: Array<{ row?: Array<Record<string, string>> }> })?.schoolInfo;
  if (!Array.isArray(root)) return [];
  const rows = root.find((x) => Array.isArray(x.row))?.row ?? [];
  return rows.map((r) => ({
    atptCode: r.ATPT_OFCDC_SC_CODE ?? "",
    atptName: r.ATPT_OFCDC_SC_NM ?? "",
    schoolCode: r.SD_SCHUL_CODE ?? "",
    name: r.SCHUL_NM ?? "",
    kind: r.SCHUL_KND_SC_NM ?? "",
    region: r.LCTN_SC_NM ?? "",
    jurisdiction: r.JU_ORG_NM ?? "",
    address: [r.ORG_RDNMA, r.ORG_RDNDA].filter(Boolean).join(" ").trim(),
    tel: r.ORG_TELNO || undefined,
    homepage: r.HMPG_ADRES || undefined,
  }));
}

/** NEIS 오류 응답(RESULT) 메시지 */
export function neisResultMessage(json: unknown): string | null {
  const r = (json as { RESULT?: { CODE?: string; MESSAGE?: string } })?.RESULT;
  if (r?.CODE && r.CODE !== "INFO-000") return r.MESSAGE ?? r.CODE;
  return null;
}
