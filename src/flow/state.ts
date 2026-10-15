// 10분 체험의 상태 기계. 모든 전이는 순수 함수이고, 화면은 상태를 저장(localStorage)해서 새로고침해도 이어진다.
import { pairById, PAIRS } from '../lib/content';
import { randomInt } from '../lib/random';
import { computeMetrics } from '../lib/scoring';
import { SPEED } from '../lib/storage';
import { makeCloze, normalize } from '../lib/text';
import {
  emptyTest, emptyWriting, type Condition, type Order, type ResultPayload, type TestRecord, type WritingRecord,
} from '../lib/types';

export type Phase = 'intro' | 'write1' | 'write2' | 'break' | 'test' | 'bill';
export const PHASES: Phase[] = ['intro', 'write1', 'write2', 'break', 'test', 'bill'];
export const phaseNum = (p: Phase) => PHASES.indexOf(p);

export type TestStep = 'intro' | 'predict' | 'quote' | 'cloze' | 'own';
const TEST_STEPS: TestStep[] = ['predict', 'quote', 'cloze', 'own'];

export const BREAK_SECONDS = 60;
export const QUOTE_SECONDS = 40;
export const CLOZE_SECONDS = 40;
export const EXTEND_SECONDS = 30;

export interface ChatMsg {
  role: 'ai' | 'me';
  text: string;
}

export interface Draft {
  text: string;
  typed: number;
  pasteBlocked: number;
  prompts: string[];
  chipUsed: boolean;
  drafts: string[];
  lastDraft: string;
  regenCount: number;
  firstDraftAt: number | null;
  chat: ChatMsg[];
  extended: boolean;
  lastInputAt: number;
}

export interface FlowState {
  v: 1;
  nickname: string;
  order: Order;
  pairId: string;
  topicSelf: string;
  topicAi: string;
  writeSeconds: number;
  seed: number;
  phase: Phase;
  phaseStartedAt: number;
  stepStartedAt: number;
  deadline: number | null;
  pausedAt: number | null;
  draft: Draft;
  writings: Partial<Record<Condition, WritingRecord>>;
  survey: Record<string, string>;
  distractor: { correct: number; total: number };
  testOrder: Condition[];
  testIndex: number;
  testStep: TestStep;
  tests: Partial<Record<Condition, TestRecord>>;
  events: [number, string][];
  result: ResultPayload | null;
}

export interface FlowOptions {
  nickname: string;
  pairId?: string;
  writeSeconds?: number;
  now?: number;
}

const ms = (sec: number) => Math.round((sec * 1000) / SPEED);

export function emptyDraft(now: number): Draft {
  return {
    text: '',
    typed: 0,
    pasteBlocked: 0,
    prompts: [],
    chipUsed: false,
    drafts: [],
    lastDraft: '',
    regenCount: 0,
    firstDraftAt: null,
    chat: [],
    extended: false,
    lastInputAt: now,
  };
}

export function createFlow(opts: FlowOptions): FlowState {
  const now = opts.now ?? Date.now();
  const pair = opts.pairId && opts.pairId !== 'random' ? pairById(opts.pairId) : PAIRS[randomInt(PAIRS.length)];
  const flip = randomInt(2) === 1;
  const [topicSelf, topicAi] = flip ? [pair.topics[1], pair.topics[0]] : [pair.topics[0], pair.topics[1]];
  return {
    v: 1,
    nickname: opts.nickname,
    order: randomInt(2) === 0 ? 'self_first' : 'ai_first',
    pairId: pair.id,
    topicSelf,
    topicAi,
    writeSeconds: opts.writeSeconds ?? 120,
    seed: randomInt(1 << 20),
    phase: 'intro',
    phaseStartedAt: now,
    stepStartedAt: now,
    deadline: null,
    pausedAt: null,
    draft: emptyDraft(now),
    writings: {},
    survey: {},
    distractor: { correct: 0, total: 0 },
    testOrder: randomInt(2) === 0 ? ['self', 'ai'] : ['ai', 'self'],
    testIndex: 0,
    testStep: 'intro',
    tests: {},
    events: [[now, 'start']],
    result: null,
  };
}

export function conditionOf(s: FlowState, phase: Phase = s.phase): Condition {
  const first: Condition = s.order === 'self_first' ? 'self' : 'ai';
  const second: Condition = first === 'self' ? 'ai' : 'self';
  return phase === 'write2' ? second : first;
}

export const topicOf = (s: FlowState, c: Condition) => (c === 'self' ? s.topicSelf : s.topicAi);

export function log(s: FlowState, now: number, what: string): FlowState {
  const events = [...s.events, [now, what.slice(0, 80)] as [number, string]].slice(-150);
  return { ...s, events };
}

function enter(s: FlowState, phase: Phase, now: number, deadlineSec: number | null): FlowState {
  return log(
    { ...s, phase, phaseStartedAt: now, stepStartedAt: now, deadline: deadlineSec === null ? null : now + ms(deadlineSec), pausedAt: s.pausedAt ? now : null },
    now,
    `phase:${phase}`,
  );
}

export function startWriting(s: FlowState, now: number): FlowState {
  return { ...enter(s, 'write1', now, s.writeSeconds), draft: emptyDraft(now) };
}

export function extendWriting(s: FlowState, now: number): FlowState {
  return log({ ...s, deadline: now + ms(EXTEND_SECONDS), draft: { ...s.draft, extended: true } }, now, 'extend');
}

export function finishWriting(s: FlowState, now: number, auto: boolean): FlowState {
  if (s.phase !== 'write1' && s.phase !== 'write2') return s;
  const c = conditionOf(s);
  const d = s.draft;
  const rec: WritingRecord = {
    ...emptyWriting(c, topicOf(s, c)),
    text: d.text.trim(),
    startedAt: s.phaseStartedAt,
    submittedAt: now,
    durationMs: Math.max(0, now - s.phaseStartedAt) * SPEED,
    typed: d.typed,
    auto,
    extended: d.extended,
    pasteBlocked: d.pasteBlocked,
    prompts: d.prompts,
    chipUsed: d.chipUsed,
    drafts: d.drafts,
    lastDraft: d.lastDraft,
    regenCount: d.regenCount,
    firstDraftAt: d.firstDraftAt,
  };
  const next = log({ ...s, writings: { ...s.writings, [c]: rec } }, now, auto ? `submit:${c}:auto` : `submit:${c}`);
  if (s.phase === 'write1') return { ...enter(next, 'write2', now, s.writeSeconds), draft: emptyDraft(now) };
  return { ...enter(next, 'break', now, BREAK_SECONDS), draft: emptyDraft(now) };
}

export function finishBreak(s: FlowState, now: number): FlowState {
  if (s.phase !== 'break') return s;
  const tests: Partial<Record<Condition, TestRecord>> = {};
  for (const c of ['self', 'ai'] as Condition[]) {
    const w = s.writings[c];
    const cloze = w ? makeCloze(w.text) : null;
    tests[c] = {
      ...emptyTest(c, topicOf(s, c)),
      skipped: !w || normalize(w.text).length < 2,
      clozeExpected: cloze?.answers ?? [],
      clozeAnswers: (cloze?.answers ?? []).map(() => ''),
    };
  }
  const order = s.testOrder.filter((c) => !tests[c]!.skipped);
  const next = { ...enter(s, 'test', now, null), tests, testOrder: order, testIndex: 0, testStep: 'intro' as TestStep };
  return order.length === 0 ? finishTest(next, now) : next;
}

export function currentTest(s: FlowState): Condition | null {
  return s.testOrder[s.testIndex] ?? null;
}

export function updateTest(s: FlowState, patch: Partial<TestRecord>): FlowState {
  const c = currentTest(s);
  if (!c) return s;
  return { ...s, tests: { ...s.tests, [c]: { ...s.tests[c]!, ...patch } } };
}

/** 시험 다음 단계로. 마지막 글의 마지막 단계면 청구서로. */
export function nextTestStep(s: FlowState, now: number): FlowState {
  if (s.phase !== 'test') return s;
  if (s.testStep === 'intro') return withStep(s, 'predict', now);
  const i = TEST_STEPS.indexOf(s.testStep);
  const c = currentTest(s)!;
  if (i < TEST_STEPS.length - 1) {
    let step = TEST_STEPS[i + 1];
    if (step === 'cloze' && s.tests[c]!.clozeExpected.length === 0) step = 'own';
    return withStep(log(s, now, `test:${c}:${s.testStep}`), step, now);
  }
  const done = log(updateTest(s, { skipped: false }), now, `test:${c}:own`);
  if (s.testIndex + 1 < s.testOrder.length) return withStep({ ...done, testIndex: s.testIndex + 1 }, 'predict', now);
  return finishTest(done, now);
}

function withStep(s: FlowState, step: TestStep, now: number): FlowState {
  const sec = step === 'quote' ? QUOTE_SECONDS : step === 'cloze' ? CLOZE_SECONDS : null;
  return { ...s, testStep: step, stepStartedAt: now, deadline: sec === null ? null : now + ms(sec) };
}

export function finishTest(s: FlowState, now: number): FlowState {
  const writings = {
    self: s.writings.self ?? emptyWriting('self', s.topicSelf),
    ai: s.writings.ai ?? emptyWriting('ai', s.topicAi),
  };
  const tests = {
    self: s.tests.self ?? emptyTest('self', s.topicSelf),
    ai: s.tests.ai ?? emptyTest('ai', s.topicAi),
  };
  const ended = enter(s, 'bill', now, null);
  const result: ResultPayload = {
    v: 1,
    order: s.order,
    pairId: s.pairId,
    topicSelf: s.topicSelf,
    topicAi: s.topicAi,
    writings,
    tests,
    survey: s.survey,
    distractor: s.distractor,
    events: ended.events,
    metrics: computeMetrics(writings, tests),
    finishedAt: now,
  };
  return { ...ended, result };
}

/** 교수자가 "늦은 학생 다음 단계로"를 누르면, 현재 단계를 지금까지 한 만큼으로 마치고 목표 단계까지 넘어간다. */
export function forceTo(s: FlowState, target: number, now: number): FlowState {
  let cur = s;
  for (let guard = 0; guard < 20 && phaseNum(cur.phase) < target; guard++) {
    const before = cur.phase;
    if (cur.phase === 'intro') cur = startWriting(cur, now);
    else if (cur.phase === 'write1' || cur.phase === 'write2') cur = finishWriting(cur, now, true);
    else if (cur.phase === 'break') cur = finishBreak(cur, now);
    else if (cur.phase === 'test') cur = finishTest(log(cur, now, 'forced'), now);
    if (cur.phase === before) break;
  }
  return cur;
}

export function pause(s: FlowState, now: number): FlowState {
  return s.pausedAt ? s : { ...s, pausedAt: now };
}

export function resume(s: FlowState, now: number): FlowState {
  if (!s.pausedAt) return s;
  const gap = now - s.pausedAt;
  return { ...s, pausedAt: null, deadline: s.deadline === null ? null : s.deadline + gap, phaseStartedAt: s.phaseStartedAt + gap };
}

export function remaining(s: FlowState, now: number): number | null {
  if (s.deadline === null) return null;
  return s.deadline - (s.pausedAt ?? now);
}

/** 교수자 현황판용 진행률(단계 안) */
export function progressOf(s: FlowState, now: number): { f: number; idle: number; step?: string } {
  const idle = Math.round(((s.pausedAt ?? now) - s.draft.lastInputAt) / 1000);
  if (s.phase === 'test') {
    const per = TEST_STEPS.length;
    const i = s.testStep === 'intro' ? 0 : TEST_STEPS.indexOf(s.testStep) + 1;
    return { f: Math.min(1, (s.testIndex * per + i) / (Math.max(1, s.testOrder.length) * per)), idle: 0, step: s.testStep };
  }
  if (s.deadline !== null) {
    const total = s.deadline - s.stepStartedAt;
    const rem = remaining(s, now) ?? 0;
    return { f: total > 0 ? Math.min(1, Math.max(0, 1 - rem / total)) : 1, idle: s.phase.startsWith('write') ? idle : 0 };
  }
  return { f: s.phase === 'bill' ? 1 : 0, idle: 0 };
}
