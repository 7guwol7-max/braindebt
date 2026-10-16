// 교수자 화면의 반 집계: 요약 통계, 겹쳐보기 갤러리, "누가 썼을까?" 퀴즈, 수업 리포트.
import type { ParticipantRow, ReflectionRow, ResultRow, SessionRow, VoteRow } from '../api/types';
import { topicById } from './content';
import { draftsFor } from './drafts';
import type { Level } from './levels';
import { mulberry32, shuffle } from './random';
import { PREDICTION_EXPECT } from './scoring';
import type { GalleryItem, PublicSummary, QuizRoundPlan, SideAgg } from './share';
import { firstSentence, normalize, similarity } from './text';
import type { Condition, ResultPayload } from './types';

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

export const HIST_BINS = ['0–19', '20–39', '40–59', '60–79', '80–100'];
const binOf = (v: number) => Math.min(4, Math.floor(Math.max(0, v) / 20));

export function activeResults(results: ResultRow[], participants: ParticipantRow[]): ResultRow[] {
  const kicked = new Set(participants.filter((p) => p.kicked).map((p) => p.id));
  return results.filter((r) => !kicked.has(r.participant_id) && r.payload?.metrics);
}

function sideAgg(ps: ResultPayload[], c: Condition): SideAgg {
  const m = ps.map((p) => p.metrics[c]);
  return {
    n: m.length,
    writeSec: mean(m.map((x) => x.writeSec)),
    typed: mean(m.map((x) => x.typed)),
    quoteSim: mean(m.map((x) => x.quoteSim)),
    clozePct: mean(m.map((x) => (x.clozeTotal ? (x.clozeCorrect / x.clozeTotal) * 100 : 0))),
    ownership: mean(m.filter((x) => x.ownership !== null).map((x) => x.ownership as number)),
    memory: mean(m.map((x) => x.memory)),
    predicted: mean(m.filter((x) => x.prediction !== null).map((x) => PREDICTION_EXPECT[x.prediction as 1 | 2 | 3])),
  };
}

function dupRate(ps: ResultPayload[], c: Condition): number {
  const items = ps
    .map((p) => ({ topic: p.writings[c].topicId, text: p.writings[c].text }))
    .filter((x) => normalize(x.text).length >= 10);
  if (items.length < 2) return 0;
  let dup = 0;
  items.forEach((a, i) => {
    if (items.some((b, j) => j !== i && b.topic === a.topic && similarity(a.text, b.text) >= 80)) dup++;
  });
  return Math.round((dup / items.length) * 100);
}

export function summarize(results: ResultRow[], participants: ParticipantRow[] = []): PublicSummary {
  const ps = activeResults(results, participants)
    .map((r) => r.payload)
    .filter((p) => p.metrics.comparable);
  const hist = { bins: HIST_BINS, self: [0, 0, 0, 0, 0], ai: [0, 0, 0, 0, 0] };
  for (const p of ps) {
    hist.self[binOf(p.metrics.self.quoteSim)]++;
    hist.ai[binOf(p.metrics.ai.quoteSim)]++;
  }
  const withDraft = ps.filter((p) => p.metrics.ai.editRatio !== null);
  const threshold = 20;
  const high = withDraft.filter((p) => (p.metrics.ai.editRatio ?? 0) >= threshold);
  const low = withDraft.filter((p) => (p.metrics.ai.editRatio ?? 0) < threshold);
  return {
    n: ps.length,
    self: sideAgg(ps, 'self'),
    ai: sideAgg(ps, 'ai'),
    hist,
    debtShare: ps.length ? Math.round((ps.filter((p) => !p.metrics.noDebt).length / ps.length) * 100) : 0,
    dupRate: { self: dupRate(ps, 'self'), ai: dupRate(ps, 'ai') },
    editSplit: {
      threshold,
      highN: high.length,
      highMemory: mean(high.map((p) => p.metrics.ai.memory)),
      lowN: low.length,
      lowMemory: mean(low.map((p) => p.metrics.ai.memory)),
    },
    scatter: withDraft.map((p) => ({ x: p.metrics.ai.editRatio ?? 0, y: p.metrics.ai.memory })),
    updatedAt: Date.now(),
  };
}

function consenting(results: ResultRow[], participants: ParticipantRow[]): ResultPayload[] {
  const ok = new Set(participants.filter((p) => p.consent && !p.kicked && !p.spectator).map((p) => p.id));
  return results.filter((r) => ok.has(r.participant_id) && r.payload?.metrics).map((r) => r.payload);
}

/** 겹쳐보기 후보: 동의한 학생의 글. 기억이 잘 난 직접 글과 기억이 안 난 AI 글이 앞에 오도록 정렬. */
export function buildGallery(results: ResultRow[], participants: ParticipantRow[]): GalleryItem[] {
  const items: GalleryItem[] = [];
  consenting(results, participants).forEach((p, i) => {
    (['self', 'ai'] as Condition[]).forEach((c) => {
      const w = p.writings[c];
      if (normalize(w.text).length < 10) return;
      items.push({
        id: `g${i}${c}`,
        condition: c,
        topic: topicById(w.topicId).short,
        original: firstSentence(w.text),
        recalled: p.tests[c].quote,
        sim: p.metrics[c].quoteSim,
      });
    });
  });
  const selfs = items.filter((x) => x.condition === 'self').sort((a, b) => b.sim - a.sim);
  const ais = items.filter((x) => x.condition === 'ai').sort((a, b) => a.sim - b.sim);
  const out: GalleryItem[] = [];
  while (selfs.length || ais.length) {
    if (selfs.length) out.push(selfs.shift()!);
    if (ais.length) out.push(ais.shift()!);
    if (ais.length) out.push(ais.shift()!);
  }
  return out;
}

/**
 * 퀴즈 라운드(최대 3): 같은 주제의 직접 쓴 글 2편 + AI와 쓴 글 2편을 섞는다.
 * AI 글이 모자라면 그 주제의 AI 초안으로 채운다. 직접 쓴 글이 없는 주제는 건너뛴다.
 */
export function buildQuizPlan(
  results: ResultRow[],
  participants: ParticipantRow[],
  planId: string,
  seed = 1,
  maxRounds = 3,
  level: Level = 'elem',
): QuizRoundPlan[] {
  const rand = mulberry32(seed);
  const pools = new Map<string, { self: string[]; ai: string[] }>();
  const seen = new Set<string>();
  const add = (topic: string, c: Condition, text: string) => {
    const n = normalize(text);
    if (n.length < 20 || seen.has(n)) return;
    seen.add(n);
    if (!pools.has(topic)) pools.set(topic, { self: [], ai: [] });
    pools.get(topic)![c].push(text.trim());
  };
  for (const p of consenting(results, participants)) {
    add(p.writings.self.topicId, 'self', p.writings.self.text);
    add(p.writings.ai.topicId, 'ai', p.writings.ai.text);
  }
  for (const pool of pools.values()) {
    pool.self = shuffle(pool.self, rand);
    pool.ai = shuffle(pool.ai, rand);
  }
  const topics = [...pools.keys()].sort((a, b) => pools.get(b)!.self.length - pools.get(a)!.self.length);
  const rounds: QuizRoundPlan[] = [];
  let t = 0;
  let idle = 0;
  while (rounds.length < maxRounds && topics.length && idle < topics.length) {
    const topic = topics[t % topics.length];
    t++;
    const pool = pools.get(topic)!;
    if (pool.self.length === 0) {
      idle++;
      continue;
    }
    idle = 0;
    const selfTexts = pool.self.splice(0, 2);
    const aiTexts = pool.ai.splice(0, 2);
    if (aiTexts.length < 2) {
      const t0 = topicById(topic);
      const lv = draftsFor(t0, level);
      const fill = shuffle([...lv.pro, ...lv.con], rand).filter((d) => !seen.has(normalize(d)));
      while (aiTexts.length < 2 && fill.length) {
        const d = fill.shift()!;
        seen.add(normalize(d));
        aiTexts.push(d);
      }
    }
    const r = rounds.length + 1;
    const cards = shuffle(
      [...selfTexts.map((text) => ({ text, ai: false })), ...aiTexts.map((text) => ({ text, ai: true }))],
      rand,
    ).map((c, k) => ({ ...c, id: `${planId}-${r}-${k}` }));
    rounds.push({
      key: `${planId}-${r}`,
      topic: topicById(topic).short,
      cards: cards.map(({ id, text }) => ({ id, text })),
      aiIds: cards.filter((c) => c.ai).map((c) => c.id),
    });
  }
  return rounds;
}

export interface QuizStats {
  voters: number;
  pickPct: Record<string, number>;
  allCorrectPct: number;
}

export function quizStats(round: QuizRoundPlan, votes: VoteRow[]): QuizStats {
  const vs = votes.filter((v) => v.vote_key === round.key && Array.isArray(v.choices) && v.choices.length > 0);
  const pickPct: Record<string, number> = {};
  for (const c of round.cards) {
    pickPct[c.id] = vs.length ? Math.round((vs.filter((v) => v.choices.includes(c.id)).length / vs.length) * 100) : 0;
  }
  const answer = new Set(round.aiIds);
  const correct = vs.filter((v) => v.choices.length === answer.size && v.choices.every((c) => answer.has(c))).length;
  return { voters: vs.length, pickPct, allCorrectPct: vs.length ? Math.round((correct / vs.length) * 100) : 0 };
}

export interface PhaseCounts {
  lobby: number;
  write1: number;
  write2: number;
  rest: number;
  test: number;
  done: number;
  total: number;
}

export const PHASE_LABELS = ['대기', '글쓰기 ①', '글쓰기 ②', '쉬는 시간', '기억 시험', '완료'];

export function phaseCounts(participants: ParticipantRow[]): PhaseCounts {
  const ps = participants.filter((p) => !p.kicked && !p.spectator);
  const c = [0, 0, 0, 0, 0, 0];
  for (const p of ps) c[Math.min(5, Math.max(0, p.phase))]++;
  return { lobby: c[0], write1: c[1], write2: c[2], rest: c[3], test: c[4], done: c[5], total: ps.length };
}

export interface ReportQuiz {
  topic: string;
  cards: { text: string; ai: boolean; pickPct: number }[];
  voters: number;
  allCorrectPct: number;
}

export interface ReportSnapshot {
  v: 1;
  level?: Level;
  name: string;
  date: string;
  participants: number;
  summary: PublicSummary;
  gallery: GalleryItem[];
  quiz: ReportQuiz[];
  reflections: string[];
}

export function buildReport(
  session: SessionRow,
  participants: ParticipantRow[],
  results: ResultRow[],
  votes: VoteRow[],
  reflections: ReflectionRow[],
): ReportSnapshot {
  const plan = session.teacher_state?.quiz?.plan ?? [];
  const shareAllowed = session.settings.shareAllowed !== false;
  const gallery = shareAllowed ? (session.teacher_state?.gallery ?? buildGallery(results, participants)).slice(0, 6) : [];
  const kicked = new Set(participants.filter((p) => p.kicked).map((p) => p.id));
  return {
    v: 1,
    level: session.settings.level ?? 'elem',
    name: session.name,
    date: session.created_at,
    participants: participants.filter((p) => !p.kicked && !p.spectator).length,
    summary: summarize(results, participants),
    gallery,
    quiz: shareAllowed
      ? plan.map((r) => {
          const s = quizStats(r, votes);
          return {
            topic: r.topic,
            cards: r.cards.map((c) => ({ text: c.text, ai: r.aiIds.includes(c.id), pickPct: s.pickPct[c.id] ?? 0 })),
            voters: s.voters,
            allCorrectPct: s.allCorrectPct,
          };
        }).filter((q) => q.voters > 0)
      : [],
    reflections: reflections.filter((r) => !r.hidden && !kicked.has(r.participant_id)).map((r) => r.text),
  };
}
