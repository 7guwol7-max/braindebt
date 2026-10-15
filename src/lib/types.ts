export type Condition = 'self' | 'ai';
export type Order = 'self_first' | 'ai_first';

export interface WritingRecord {
  condition: Condition;
  topicId: string;
  text: string;
  startedAt: number;
  submittedAt: number;
  durationMs: number;
  /** 편집창에 직접 친 글자 수 (붙여넣기·AI 삽입 제외) */
  typed: number;
  auto: boolean;
  extended: boolean;
  pasteBlocked: number;
  // AI 조건 전용
  prompts: string[];
  chipUsed: boolean;
  drafts: string[];
  lastDraft: string;
  regenCount: number;
  firstDraftAt: number | null;
}

export interface TestRecord {
  condition: Condition;
  topicId: string;
  prediction: 1 | 2 | 3 | null;
  quote: string;
  quoteGaveUp: boolean;
  clozeExpected: string[];
  clozeAnswers: string[];
  ownership: number | null;
  skipped: boolean;
}

export interface SideMetrics {
  hasText: boolean;
  writeSec: number;
  typed: number;
  chars: number;
  prediction: 1 | 2 | 3 | null;
  quoteSim: number;
  clozeCorrect: number;
  clozeTotal: number;
  ownership: number | null;
  /** 기억 점수 0~100: (첫 문장 일치율 + 빈칸 정답률) / 2 */
  memory: number;
}

export interface AiExtra {
  usedAi: boolean;
  editRatio: number | null;
  regenCount: number;
  readSec: number | null;
  prompt: string;
}

export interface Metrics {
  self: SideMetrics;
  ai: SideMetrics & AiExtra;
  comparable: boolean;
  /** 직접 쓴 글 기억 − AI 글 기억 (클수록 부채가 큼) */
  debt: number;
  noDebt: boolean;
}

export interface ResultPayload {
  v: 1;
  order: Order;
  pairId: string;
  topicSelf: string;
  topicAi: string;
  writings: Record<Condition, WritingRecord>;
  tests: Record<Condition, TestRecord>;
  survey: Record<string, string>;
  distractor: { correct: number; total: number };
  events: [number, string][];
  metrics: Metrics;
  finishedAt: number;
}

export function emptyWriting(condition: Condition, topicId: string): WritingRecord {
  return {
    condition,
    topicId,
    text: '',
    startedAt: 0,
    submittedAt: 0,
    durationMs: 0,
    typed: 0,
    auto: true,
    extended: false,
    pasteBlocked: 0,
    prompts: [],
    chipUsed: false,
    drafts: [],
    lastDraft: '',
    regenCount: 0,
    firstDraftAt: null,
  };
}

export function emptyTest(condition: Condition, topicId: string): TestRecord {
  return {
    condition,
    topicId,
    prediction: null,
    quote: '',
    quoteGaveUp: false,
    clozeExpected: [],
    clozeAnswers: [],
    ownership: null,
    skipped: true,
  };
}
