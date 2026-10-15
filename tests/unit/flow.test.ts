import { describe, expect, it } from 'vitest';
import {
  conditionOf, createFlow, currentTest, finishBreak, finishWriting, forceTo, nextTestStep, pause, remaining, resume,
  startWriting, updateTest,
} from '../../src/flow/state';
import { TOPICS } from '../../src/lib/content';
import { firstSentence } from '../../src/lib/text';

describe('flow', () => {
  it('runs intro → write ×2 → break → test → bill', () => {
    let t = 1_000_000;
    let s = createFlow({ nickname: '민지', pairId: 'p1', writeSeconds: 120, now: t });
    expect(s.pairId).toBe('p1');
    expect(new Set([s.topicSelf, s.topicAi])).toEqual(new Set(['phone', 'lunch']));
    s = startWriting(s, t);
    const c1 = conditionOf(s);
    const selfText = '나는 찬성한다. 휴대폰은 안전에 꼭 필요하다. 연락이 중요하기 때문이다.';
    const aiText = TOPICS[s.topicAi].drafts.pro[0];
    const fill = (st: typeof s, at: number) =>
      conditionOf(st) === 'self'
        ? { ...st, draft: { ...st.draft, text: selfText, typed: 30 } }
        : { ...st, draft: { ...st.draft, text: aiText, drafts: [aiText], lastDraft: aiText, firstDraftAt: at + 5000 } };
    s = fill(s, t);
    t += 90_000;
    s = finishWriting(s, t, false);
    expect(s.phase).toBe('write2');
    expect(s.writings[c1]?.durationMs).toBe(90_000);
    s = fill(s, t);
    t += 40_000;
    s = finishWriting(s, t, false);
    expect(s.phase).toBe('break');
    expect(remaining(s, t)).toBe(60_000);

    // 일시 정지하면 남은 시간이 멈춘다.
    s = pause(s, t + 10_000);
    expect(remaining(s, t + 50_000)).toBe(50_000);
    s = resume(s, t + 50_000);
    expect(remaining(s, t + 50_000)).toBe(50_000);

    t += 100_000;
    s = finishBreak(s, t);
    expect(s.phase).toBe('test');
    expect(s.testOrder).toHaveLength(2);
    while (s.phase === 'test') {
      const c = currentTest(s);
      if (s.testStep === 'predict') s = updateTest(s, { prediction: 3 });
      if (s.testStep === 'quote' && c === 'self') s = updateTest(s, { quote: firstSentence(selfText) });
      if (s.testStep === 'cloze' && c === 'self') s = updateTest(s, { clozeAnswers: s.tests.self!.clozeExpected });
      if (s.testStep === 'own') s = updateTest(s, { ownership: c === 'self' ? 90 : 30 });
      s = nextTestStep(s, (t += 5000));
    }
    expect(s.phase).toBe('bill');
    const m = s.result!.metrics;
    expect(m.self.memory).toBe(100);
    expect(m.ai.memory).toBe(0);
    expect(m.noDebt).toBe(false);
    expect(m.ai.usedAi).toBe(true);
    expect(s.result!.tests.self.skipped).toBe(false);
  });

  it('forced advance auto-submits and skips tests for empty texts', () => {
    let s = createFlow({ nickname: 'x', now: 0 });
    s = forceTo(s, 1, 10);
    expect(s.phase).toBe('write1');
    s = { ...s, draft: { ...s.draft, text: '조금 썼다. 이게 다다.' } };
    s = forceTo(s, 4, 20);
    expect(s.phase).toBe('test');
    expect(s.testOrder).toEqual([conditionOf(s, 'write1')]);
    s = forceTo(s, 5, 30);
    expect(s.phase).toBe('bill');
    expect(s.result!.metrics.comparable).toBe(false);
    expect(s.result!.writings[conditionOf(s, 'write1')].auto).toBe(true);
  });
});
