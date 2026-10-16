// 참여자 수준별 설정. 글 형식, 최소 분량, 쓰기·시험 시간, 빈칸 수, AI 초안 길이가 함께 달라진다.
import { countSentences } from './text';

export type Level = 'elem' | 'middle' | 'adult';

export interface LevelSpec {
  id: Level;
  label: string;
  audience: string;
  /** 글쓰기 화면에 보여 줄 형식 안내 */
  format: string;
  /** AI 초안 문장 수 (요청 칩과 도우미 말에 쓴다) */
  sentences: string;
  minSentences: number;
  minChars: number;
  writeSeconds: number;
  writeOptions: number[];
  quoteSeconds: number;
  clozeSeconds: number;
  clozeBlanks: number;
  starters: string[];
  editorRows: number;
}

export const LEVELS: Record<Level, LevelSpec> = {
  elem: {
    id: 'elem',
    label: '초등',
    audience: '초등 3학년 이상',
    format: '주장 1문장 + 이유 2문장, 모두 3문장',
    sentences: '3문장',
    minSentences: 2,
    minChars: 40,
    writeSeconds: 120,
    writeOptions: [90, 120, 150, 180],
    quoteSeconds: 40,
    clozeSeconds: 40,
    clozeBlanks: 3,
    starters: ['나는 ~에 찬성한다. / 나는 ~에 반대한다.', '왜냐하면 ~ 때문이다.', '또한 ~.'],
    editorRows: 6,
  },
  middle: {
    id: 'middle',
    label: '중·고등',
    audience: '중학생·고등학생',
    format: '주장 1문장 + 이유 2가지와 근거·예시 + 맺음, 5문장 안팎',
    sentences: '5문장',
    minSentences: 4,
    minChars: 120,
    writeSeconds: 180,
    writeOptions: [150, 180, 240, 300],
    quoteSeconds: 50,
    clozeSeconds: 50,
    clozeBlanks: 4,
    starters: ['나는 ~에 찬성한다. / 나는 ~에 반대한다.', '첫째, ~ 때문이다. 예를 들어 ~.', '둘째, ~.', '그러므로 ~.'],
    editorRows: 8,
  },
  adult: {
    id: 'adult',
    label: '성인·교사',
    audience: '대학생·성인·교사 연수',
    format: '주장, 이유 2가지와 근거, 예상되는 반론과 재반박, 맺음까지 7문장 안팎',
    sentences: '7문장 안팎',
    minSentences: 5,
    minChars: 220,
    writeSeconds: 240,
    writeOptions: [180, 240, 300, 360],
    quoteSeconds: 60,
    clozeSeconds: 60,
    clozeBlanks: 5,
    starters: [
      '나는 ~해야 한다고 본다.',
      '첫째, ~. 실제로 ~.',
      '둘째, ~.',
      '물론 ~라는 반론도 있다.',
      '그러나 ~.',
      '따라서 ~.',
    ],
    editorRows: 10,
  },
};

export const LEVEL_ORDER: Level[] = ['elem', 'middle', 'adult'];

export function levelSpec(level: Level | undefined | null): LevelSpec {
  return LEVELS[level ?? 'elem'] ?? LEVELS.elem;
}

export function isLevel(v: unknown): v is Level {
  return v === 'elem' || v === 'middle' || v === 'adult';
}

/** 체험 전체에 걸리는 대략의 시간(분): 글 두 편 + 쉬는 시간 1분 + 시험 + 시작·결과 확인 여유 1분 */
export function estimatedMinutes(level: Level, writeSeconds?: number): number {
  const s = levelSpec(level);
  const write = (writeSeconds ?? s.writeSeconds) * 2;
  const test = 2 * (s.quoteSeconds + s.clozeSeconds + 20);
  return Math.ceil((write + 60 + test) / 60) + 1;
}

/** 제출할 수 있는 최소 분량을 채웠는지 */
export function meetsMinimum(text: string, level: Level = 'elem'): boolean {
  const s = levelSpec(level);
  return [...text.trim()].length >= s.minChars && countSentences(text) >= s.minSentences;
}
