// 영어 문장 타이핑 채점: 대소문자·문장부호·축약형 차이를 허용하고 단어 단위로 비교한다

const CONTRACTIONS: Record<string, string> = {
  "i'm": "i am",
  "you're": "you are",
  "we're": "we are",
  "they're": "they are",
  "he's": "he is",
  "she's": "she is",
  "it's": "it is",
  "that's": "that is",
  "what's": "what is",
  "where's": "where is",
  "who's": "who is",
  "how's": "how is",
  "there's": "there is",
  "here's": "here is",
  "let's": "let us",
  "i've": "i have",
  "you've": "you have",
  "we've": "we have",
  "they've": "they have",
  "i'll": "i will",
  "you'll": "you will",
  "we'll": "we will",
  "he'll": "he will",
  "she'll": "she will",
  "it'll": "it will",
  "they'll": "they will",
  "i'd": "i would",
  "you'd": "you would",
  "we'd": "we would",
  "he'd": "he would",
  "she'd": "she would",
  "they'd": "they would",
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "haven't": "have not",
  "hasn't": "has not",
  "hadn't": "had not",
  "won't": "will not",
  "wouldn't": "would not",
  "can't": "can not",
  "cannot": "can not",
  "couldn't": "could not",
  "shouldn't": "should not",
};

/** 비교용 정규화: 소문자, 따옴표 통일, 문장부호 제거(하이픈·아포스트로피 유지), 축약형 풀기 */
export function normalizeSentence(input: string): string {
  let s = input
    .toLowerCase()
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[.,!?;:"()…]/g, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  s = s
    .split(" ")
    .map((w) => CONTRACTIONS[w] ?? w)
    .join(" ");
  return s;
}

export function wordsOf(input: string): string[] {
  const n = normalizeSentence(input);
  return n ? n.split(" ") : [];
}

export function isCorrectAnswer(input: string, answer: string, alternatives: string[] = []): boolean {
  const n = normalizeSentence(input);
  if (!n) return false;
  return [answer, ...alternatives].some((a) => normalizeSentence(a) === n);
}

export type DiffToken = { word: string; kind: "ok" | "missing" | "extra" };

/** 정답 단어열 기준 LCS 비교 → 맞은 단어 / 빠진 단어 / 잘못 넣은 단어 */
export function diffWords(input: string, answer: string): DiffToken[] {
  const a = wordsOf(answer);
  const b = wordsOf(input);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ word: a[i], kind: "ok" });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ word: a[i], kind: "missing" });
      i++;
    } else {
      out.push({ word: b[j], kind: "extra" });
      j++;
    }
  }
  while (i < a.length) out.push({ word: a[i++], kind: "missing" });
  while (j < b.length) out.push({ word: b[j++], kind: "extra" });
  return out;
}

/** 힌트: 각 단어의 첫 글자만 보여준다 (You haven't changed a bit. → Y__ h_____ c______ a b__.) */
export function firstLetterHint(answer: string): string {
  return answer
    .split(/\s+/)
    .map((w) => w.replace(/^([A-Za-z])([A-Za-z'’-]*)/, (_m, f: string, rest: string) => f + rest.replace(/[A-Za-z]/g, "_")))
    .join(" ");
}

/** 음성인식 결과가 정답 단어를 얼마나 포함하는지 (0~1, 참고용) */
export function speechMatchRatio(recognized: string, answer: string): number {
  const target = wordsOf(answer);
  if (!target.length) return 0;
  const got = new Set(wordsOf(recognized));
  return target.filter((w) => got.has(w)).length / target.length;
}
