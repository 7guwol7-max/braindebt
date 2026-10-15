import { clozeCorrect, editRatio, firstSentence, normalize, similarity } from './text';
import type { Metrics, SideMetrics, TestRecord, WritingRecord } from './types';

/** 예측 이모지 → 기대 기억 점수 */
export const PREDICTION_EXPECT: Record<1 | 2 | 3, number> = { 1: 20, 2: 50, 3: 80 };
export const PREDICTION_EMOJI: Record<1 | 2 | 3, string> = { 1: '😟', 2: '😐', 3: '😎' };
export const PREDICTION_LABEL: Record<1 | 2 | 3, string> = { 1: '거의 안 날 듯', 2: '반쯤', 3: '잘 기억날 듯' };

/** 기억 점수가 이만큼 이상 차이 나야 "부채"로 본다. */
export const DEBT_THRESHOLD = 10;

function side(w: WritingRecord, t: TestRecord): SideMetrics {
  const hasText = normalize(w.text).length >= 2;
  const quoteSim = hasText ? similarity(firstSentence(w.text), t.quote) : 0;
  const clozeTotal = t.clozeExpected.length;
  const clozeHits = t.clozeExpected.filter((e, i) => clozeCorrect(t.clozeAnswers[i] ?? '', e)).length;
  const memory = clozeTotal > 0 ? Math.round((quoteSim + (clozeHits / clozeTotal) * 100) / 2) : quoteSim;
  return {
    hasText,
    writeSec: Math.round(w.durationMs / 1000),
    typed: w.typed,
    chars: [...w.text.trim()].length,
    prediction: t.prediction,
    quoteSim,
    clozeCorrect: clozeHits,
    clozeTotal,
    ownership: t.ownership,
    memory,
  };
}

export function computeMetrics(writings: Record<'self' | 'ai', WritingRecord>, tests: Record<'self' | 'ai', TestRecord>): Metrics {
  const self = side(writings.self, tests.self);
  const aiBase = side(writings.ai, tests.ai);
  const w = writings.ai;
  const usedAi = w.drafts.length > 0;
  const readSec =
    usedAi && w.firstDraftAt && w.submittedAt ? Math.max(0, Math.round((w.submittedAt - w.firstDraftAt) / 1000)) : null;
  const ai = {
    ...aiBase,
    usedAi,
    editRatio: usedAi ? editRatio(w.lastDraft, w.text) : null,
    regenCount: w.regenCount,
    readSec,
    prompt: w.prompts.join(' / '),
  };
  const comparable = self.hasText && ai.hasText;
  const debt = comparable ? self.memory - ai.memory : 0;
  return { self, ai, comparable, debt, noDebt: comparable && debt < DEBT_THRESHOLD };
}

export function fmtSec(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}초`;
  return r === 0 ? `${m}분` : `${m}분 ${r}초`;
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
