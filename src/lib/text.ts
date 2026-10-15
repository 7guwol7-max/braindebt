// 글자 단위 비교 도구: 문장 분리, 유사도, 빈칸 만들기, 편집 거리, 겹쳐 보기용 정렬.

const NON_WORD = /[^\p{L}\p{N}]/gu;
const IS_WORD = /[\p{L}\p{N}]/u;

/** 공백·문장부호를 지우고 소문자로. 비교는 항상 이 형태로 한다. */
export function normalize(s: string): string {
  return (s ?? '').toLowerCase().replace(NON_WORD, '');
}

/** 마침표·물음표·느낌표·줄바꿈으로 문장을 나눈다. 글자가 2개 미만인 조각은 버린다. */
export function splitSentences(text: string): string[] {
  const parts = (text ?? '').replace(/\r/g, '').match(/[^.!?…。\n]+[.!?…。]*/gu) ?? [];
  return parts.map((p) => p.trim()).filter((p) => normalize(p).length >= 2);
}

export function countSentences(text: string): number {
  return splitSentences(text).length;
}

export function firstSentence(text: string): string {
  return splitSentences(text)[0] ?? '';
}

function bigrams(s: string): string[] {
  if (s.length === 0) return [];
  if (s.length === 1) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** 글자 2-gram 겹침(Dice 계수), 0~1. */
export function dice(a: string, b: string): number {
  const A = bigrams(normalize(a));
  const B = bigrams(normalize(b));
  if (A.length === 0 || B.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of B) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      hit++;
      counts.set(g, c - 1);
    }
  }
  return (2 * hit) / (A.length + B.length);
}

/** 유사도 0~100 (정수). */
export function similarity(a: string, b: string): number {
  return Math.round(dice(a, b) * 100);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** AI 초안 대비 최종 글이 바뀐 비율 0~100. 초안이 없으면 null. */
export function editRatio(draft: string, final: string): number | null {
  if (!draft) return null;
  const d = levenshtein(draft.trim(), (final ?? '').trim());
  return Math.min(100, Math.round((d / Math.max(draft.trim().length, 1)) * 100));
}

// ---------------------------------------------------------------- 빈칸 채우기

const STOPWORDS = new Set(
  [
    '그리고', '하지만', '그러나', '왜냐하면', '또한', '따라서', '그래서', '그러므로', '게다가', '특히',
    '첫째', '둘째', '아울러', '때문이다', '때문입니다', '때문에', '생각한다', '생각합니다', '생각해요',
    '있다', '있습니다', '있어요', '있기', '있는', '없다', '없습니다', '한다', '합니다', '해요', '된다',
    '됩니다', '것이다', '것입니다', '것이', '것은', '하는', '같다', '같습니다', '좋겠다', '좋겠습니다',
    '수', '더', '잘', '이다', '입니다',
  ].map(normalize),
);

export type ClozePart =
  | { type: 'text'; text: string }
  | { type: 'blank'; index: number; answer: string; len: number };

export interface Cloze {
  parts: ClozePart[];
  answers: string[];
}

interface Token {
  raw: string;
  lead: string;
  core: string;
  trail: string;
  norm: string;
}

function tokenize(s: string): Token[] {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      const m = raw.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
      const lead = m?.[1] ?? '';
      const core = m?.[2] ?? raw;
      const trail = m?.[3] ?? '';
      return { raw, lead, core, trail, norm: normalize(core) };
    });
}

/**
 * 첫 문장을 뺀 나머지 문장에서 긴 어절 max개를 빈칸으로 만든다.
 * 빈칸끼리는 붙어 있지 않게 고르고, 접속어·서술어 같은 흔한 말은 되도록 피한다.
 */
export function makeCloze(text: string, max = 3): Cloze | null {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return null;
  let tokens: Token[];
  let skip = 0;
  if (sentences.length >= 2) {
    tokens = tokenize(sentences.slice(1).join(' '));
  } else {
    tokens = tokenize(sentences[0]);
    skip = Math.min(3, Math.floor(tokens.length / 2));
  }
  const pick = (allowStop: boolean, already: Set<number>) => {
    const candidates = tokens
      .map((t, i) => ({ t, i }))
      .filter(({ t, i }) => i >= skip && t.norm.length >= 2 && !already.has(i) && (allowStop || !STOPWORDS.has(t.norm)))
      .sort((x, y) => y.t.norm.length - x.t.norm.length || x.i - y.i);
    for (const { i } of candidates) {
      if (already.size >= max) break;
      if (already.has(i - 1) || already.has(i + 1)) continue;
      already.add(i);
    }
  };
  const chosen = new Set<number>();
  pick(false, chosen);
  if (chosen.size < max) pick(true, chosen);
  if (chosen.size === 0) return null;

  const order = [...chosen].sort((a, b) => a - b);
  const blankIndex = new Map(order.map((tokIdx, k) => [tokIdx, k]));
  const parts: ClozePart[] = [];
  let buf = '';
  const flush = () => {
    if (buf) parts.push({ type: 'text', text: buf });
    buf = '';
  };
  tokens.forEach((t, i) => {
    const sep = i === 0 ? '' : ' ';
    const k = blankIndex.get(i);
    if (k === undefined) {
      buf += sep + t.raw;
      return;
    }
    buf += sep + t.lead;
    flush();
    parts.push({ type: 'blank', index: k, answer: t.core, len: [...t.core].length });
    buf = t.trail;
  });
  flush();
  return { parts, answers: order.map((i) => tokens[i].core) };
}

/** 빈칸 정답 판정: 같거나, 조사 정도만 다르거나(앞부분 일치·길이 차 2 이하), 2-gram 겹침 70% 이상. */
export function clozeCorrect(answer: string, expected: string): boolean {
  const a = normalize(answer);
  const e = normalize(expected);
  if (!a || !e) return false;
  if (a === e) return true;
  if (a.length >= 2 && e.length >= 2 && (e.startsWith(a) || a.startsWith(e)) && Math.abs(a.length - e.length) <= 2) {
    return true;
  }
  return dice(a, e) >= 0.7;
}

// ---------------------------------------------------------------- 겹쳐 보기 / 바뀐 부분

/**
 * 두 글의 공통 글자(LCS)를 찾아 각 글자마다 일치 여부를 돌려준다.
 * 공백·문장부호는 비교에서 빼고 false로 둔다(화면에서는 중립색).
 */
export function matchMask(a: string, b: string): { a: boolean[]; b: boolean[] } {
  const A = [...a];
  const B = [...b];
  const ai: number[] = [];
  const bi: number[] = [];
  A.forEach((ch, i) => IS_WORD.test(ch) && ai.push(i));
  B.forEach((ch, i) => IS_WORD.test(ch) && bi.push(i));
  const n = ai.length;
  const m = bi.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        A[ai[i]].toLowerCase() === B[bi[j]].toLowerCase() ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ma = new Array<boolean>(A.length).fill(false);
  const mb = new Array<boolean>(B.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[ai[i]].toLowerCase() === B[bi[j]].toLowerCase()) {
      ma[ai[i]] = true;
      mb[bi[j]] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { a: ma, b: mb };
}

export type DiffSeg = { type: 'same' | 'add' | 'del'; text: string };

/** 글자 단위 diff (초안 → 최종). */
export function diffChars(from: string, to: string): DiffSeg[] {
  const A = [...from];
  const B = [...to];
  const n = A.length;
  const m = B.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const segs: DiffSeg[] = [];
  const push = (type: DiffSeg['type'], ch: string) => {
    const last = segs[segs.length - 1];
    if (last && last.type === type) last.text += ch;
    else segs.push({ type, text: ch });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push('same', A[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('del', A[i]);
      i++;
    } else {
      push('add', B[j]);
      j++;
    }
  }
  while (i < n) push('del', A[i++]);
  while (j < m) push('add', B[j++]);
  return segs;
}
