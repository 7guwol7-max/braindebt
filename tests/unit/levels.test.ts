import { describe, expect, it } from 'vitest';
import { ScriptedAssistant } from '../../src/lib/ai';
import { TOPICS } from '../../src/lib/content';
import { draftsFor } from '../../src/lib/drafts';
import { LEVEL_ORDER, LEVELS, estimatedMinutes, meetsMinimum, type Level } from '../../src/lib/levels';
import { countSentences, firstSentence, makeCloze } from '../../src/lib/text';
import {
  conditionOf, createFlow, finishBreak, finishWriting, nextTestStep, remaining, setLevel, startWriting,
} from '../../src/flow/state';

const SHAPE: Record<Level, { sentences: number; min: number; max: number }> = {
  elem: { sentences: 3, min: 60, max: 130 },
  middle: { sentences: 5, min: 170, max: 280 },
  adult: { sentences: 7, min: 300, max: 450 },
};

describe('levels', () => {
  it('every level has 3 drafts per stance per topic with the right shape', () => {
    for (const level of LEVEL_ORDER) {
      for (const t of Object.values(TOPICS)) {
        const d = draftsFor(t, level);
        for (const stance of ['pro', 'con'] as const) {
          expect(d[stance], `${t.id} ${level} ${stance}`).toHaveLength(3);
          expect(new Set(d[stance].map(firstSentence)).size, `${t.id} ${level} ${stance} first sentences`).toBe(3);
          for (const text of d[stance]) {
            const shape = SHAPE[level];
            expect(countSentences(text), text).toBe(shape.sentences);
            expect(text.length, text).toBeGreaterThanOrEqual(shape.min);
            expect(text.length, text).toBeLessThanOrEqual(shape.max);
            // AI 초안은 그 수준의 제출 기준을 넘어야 하고, 빈칸을 그 수준 개수만큼 만들 수 있어야 한다.
            expect(meetsMinimum(text, level), text).toBe(true);
            expect(makeCloze(text, LEVELS[level].clozeBlanks)?.answers.length, text).toBe(LEVELS[level].clozeBlanks);
          }
        }
      }
    }
  });

  it('adult drafts are at least twice as long as elementary ones', () => {
    const avg = (level: Level) => {
      const all = Object.values(TOPICS).flatMap((t) => [...draftsFor(t, level).pro, ...draftsFor(t, level).con]);
      return all.reduce((a, b) => a + b.length, 0) / all.length;
    };
    expect(avg('adult')).toBeGreaterThanOrEqual(avg('elem') * 2);
    expect(avg('middle')).toBeGreaterThan(avg('elem'));
  });

  it('minimum length rules grow with level', () => {
    const elemText = '나는 찬성한다. 왜냐하면 친구와 연락할 수 있기 때문이다. 또한 공부에도 도움이 된다.';
    expect(meetsMinimum(elemText, 'elem')).toBe(true);
    expect(meetsMinimum(elemText, 'middle')).toBe(false);
    expect(meetsMinimum(elemText, 'adult')).toBe(false);
    expect(LEVELS.adult.minChars).toBeGreaterThanOrEqual(LEVELS.elem.minChars * 2);
    expect(estimatedMinutes('elem')).toBe(10);
    expect(estimatedMinutes('middle')).toBeGreaterThan(10);
    expect(estimatedMinutes('adult')).toBeGreaterThan(estimatedMinutes('middle'));
  });

  it('the assistant hands out drafts of the chosen level', () => {
    const a = new ScriptedAssistant(TOPICS.phone, 0, 'adult');
    const r = a.reply('찬성하는 글 써줘');
    expect(TOPICS.phone.drafts.pro).not.toContain(r.draft);
    expect(draftsFor(TOPICS.phone, 'adult').pro).toContain(r.draft);
    expect(r.message).toContain('7문장 안팎');
    expect(new ScriptedAssistant(TOPICS.phone, 0).reply('찬성').message).toContain('3문장');
  });

  it('flow uses level timings and blank counts; level is fixed once started', () => {
    let s = createFlow({ nickname: '', level: 'adult', now: 0 });
    expect(s.writeSeconds).toBe(LEVELS.adult.writeSeconds);
    expect(setLevel(s, 'elem').writeSeconds).toBe(LEVELS.elem.writeSeconds);
    s = startWriting(s, 0);
    expect(setLevel(s, 'elem').level).toBe('adult');
    const longText = draftsFor(TOPICS[s.topicSelf], 'adult').pro[0];
    const aiText = draftsFor(TOPICS[s.topicAi], 'adult').con[1];
    s = { ...s, draft: { ...s.draft, text: conditionOf(s) === 'self' ? longText : aiText } };
    s = finishWriting(s, 1000, false);
    s = { ...s, draft: { ...s.draft, text: conditionOf(s) === 'self' ? longText : aiText } };
    s = finishWriting(s, 2000, false);
    s = finishBreak(s, 3000);
    expect(s.tests.self?.clozeExpected).toHaveLength(LEVELS.adult.clozeBlanks);
    s = nextTestStep(s, 4000); // predict
    s = nextTestStep(s, 5000); // quote
    expect(s.testStep).toBe('quote');
    expect(remaining(s, 5000)).toBe(LEVELS.adult.quoteSeconds * 1000);
    expect(createFlow({ nickname: '' }).level).toBe('elem');
  });
});
