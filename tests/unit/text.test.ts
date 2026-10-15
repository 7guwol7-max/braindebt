import { describe, expect, it } from 'vitest';
import {
  clozeCorrect, countSentences, diffChars, editRatio, firstSentence, makeCloze, matchMask, normalize, similarity, splitSentences,
} from '../../src/lib/text';
import { ScriptedAssistant, detectStance } from '../../src/lib/ai';
import { PAIRS, TOPICS } from '../../src/lib/content';
import { computeMetrics } from '../../src/lib/scoring';
import { emptyTest, emptyWriting } from '../../src/lib/types';

describe('sentences', () => {
  it('splits on punctuation and newlines, keeps a trailing sentence without a period', () => {
    expect(splitSentences('나는 찬성한다. 왜냐하면 편하다! 또한 좋다')).toEqual(['나는 찬성한다.', '왜냐하면 편하다!', '또한 좋다']);
    expect(countSentences('한 줄\n두 줄')).toBe(2);
    expect(countSentences('  . . ')).toBe(0);
    expect(firstSentence('첫 문장이다.두 번째다.')).toBe('첫 문장이다.');
  });
});

describe('similarity', () => {
  it('ignores spacing and punctuation', () => {
    expect(similarity('휴대폰을 허용해야 한다.', '휴대폰을허용해야한다')).toBe(100);
  });
  it('is partial for partial recall and 0 for nothing', () => {
    const s = similarity('학교에 휴대폰을 가져오는 것은 허용되어야 한다.', '휴대폰은 허용해야 한다');
    expect(s).toBeGreaterThan(30);
    expect(s).toBeLessThan(80);
    expect(similarity('무엇이든', '')).toBe(0);
  });
  it('normalize strips everything but letters and digits', () => {
    expect(normalize('A, b! 가 나.')).toBe('ab가나');
  });
});

describe('cloze', () => {
  const text = '나는 교복에 찬성한다. 왜냐하면 친구들과 옷차림으로 비교하지 않아도 되기 때문이다. 또한 아침마다 고민하는 시간을 아낄 수 있다.';
  it('blanks up to 3 non-adjacent long words outside the first sentence', () => {
    const c = makeCloze(text)!;
    expect(c.answers).toHaveLength(3);
    for (const a of c.answers) expect(text.split('.')[0]).not.toContain(a);
    expect(c.answers).not.toContain('때문이다');
    const blanks = c.parts.filter((p) => p.type === 'blank');
    expect(blanks).toHaveLength(3);
    const rebuilt = c.parts.map((p) => (p.type === 'text' ? p.text : p.answer)).join('');
    expect(rebuilt).toBe(splitSentences(text).slice(1).join(' '));
  });
  it('handles a single sentence and empty text', () => {
    expect(makeCloze('')).toBeNull();
    const c = makeCloze('나는 휴대폰을 학교에 가져오는 것을 강력하게 찬성하는 입장이다');
    expect(c?.answers.length).toBeGreaterThan(0);
  });
  it('accepts particle differences but not wrong words', () => {
    expect(clozeCorrect('휴대폰', '휴대폰을')).toBe(true);
    expect(clozeCorrect('옷차림', '옷차림으로')).toBe(true);
    expect(clozeCorrect('급식', '교복을')).toBe(false);
    expect(clozeCorrect('', '교복')).toBe(false);
  });
});

describe('diff and edit ratio', () => {
  it('measures edits relative to the draft', () => {
    expect(editRatio('abcd', 'abcd')).toBe(0);
    expect(editRatio('abcd', 'abXd')).toBe(25);
    expect(editRatio('', 'x')).toBeNull();
    const segs = diffChars('가나다', '가X다');
    expect(segs.map((s) => s.type)).toEqual(['same', 'del', 'add', 'same']);
  });
  it('matchMask marks shared characters', () => {
    const m = matchMask('가나다', '가다');
    expect(m.a).toEqual([true, false, true]);
    expect(m.b).toEqual([true, true]);
  });
});

describe('scripted assistant', () => {
  const phone = TOPICS.phone;
  it('detects stance', () => {
    expect(detectStance('찬성하는 글 써줘', phone)).toBe('pro');
    expect(detectStance('반대 입장으로 써 줘', phone)).toBe('con');
    expect(detectStance('반대 말고 찬성으로', phone)).toBe('pro');
    expect(detectStance('휴대폰 금지해야 한다는 글', phone)).toBe('con');
    expect(detectStance('허용하면 안 된다고 써줘', phone)).toBe('con');
    expect(detectStance('교복 유지하자는 글', TOPICS.uniform)).toBe('con');
    expect(detectStance('교복 없애야 한다고 써줘', TOPICS.uniform)).toBe('pro');
    expect(detectStance('안녕', phone)).toBeNull();
  });
  it('rotates drafts and asks when the request is unclear', () => {
    const a = new ScriptedAssistant(phone, 0);
    expect(a.reply('안녕').kind).toBe('ask');
    const d1 = a.reply('찬성으로 써줘');
    const d2 = a.regenerate();
    expect(d1.draft).not.toBe(d2.draft);
    expect(d2.stance).toBe('pro');
    const d3 = a.reply('반대로 써줘');
    expect(phone.drafts.con).toContain(d3.draft);
  });
  it('every draft is 3 sentences of 60-130 characters', () => {
    for (const t of Object.values(TOPICS)) {
      for (const d of [...t.drafts.pro, ...t.drafts.con]) {
        expect(countSentences(d), d).toBe(3);
        expect(d.length, d).toBeGreaterThanOrEqual(60);
        expect(d.length, d).toBeLessThanOrEqual(130);
        expect(makeCloze(d)?.answers.length, d).toBe(3);
      }
    }
    expect(PAIRS.flatMap((p) => p.topics).sort()).toEqual(Object.keys(TOPICS).sort());
  });
});

describe('metrics', () => {
  it('computes memory and debt', () => {
    const self = { ...emptyWriting('self', 'phone'), text: '나는 찬성한다. 휴대폰은 안전에 필요하다. 연락이 중요하다.', durationMs: 110000, typed: 30 };
    const draft = TOPICS.lunch.drafts.pro[0];
    const ai = { ...emptyWriting('ai', 'lunch'), text: draft, lastDraft: draft, drafts: [draft], durationMs: 40000, firstDraftAt: 1000, submittedAt: 21000 };
    const cs = makeCloze(self.text)!;
    const ca = makeCloze(ai.text)!;
    const tests = {
      self: { ...emptyTest('self', 'phone'), quote: '나는 찬성한다', clozeExpected: cs.answers, clozeAnswers: cs.answers, prediction: 2 as const, skipped: false },
      ai: { ...emptyTest('ai', 'lunch'), quote: '', clozeExpected: ca.answers, clozeAnswers: ['', '', ''], prediction: 3 as const, skipped: false },
    };
    const m = computeMetrics({ self, ai }, tests);
    expect(m.self.memory).toBeGreaterThan(90);
    expect(m.ai.memory).toBe(0);
    expect(m.debt).toBeGreaterThan(90);
    expect(m.noDebt).toBe(false);
    expect(m.ai.editRatio).toBe(0);
    expect(m.ai.readSec).toBe(20);
    expect(m.comparable).toBe(true);
  });
});
