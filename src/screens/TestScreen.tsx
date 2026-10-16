import { useEffect, useMemo, useState, type ClipboardEvent } from 'react';
import { Button, Card, TimerBar, cx } from '../components/ui';
import { topicById } from '../lib/content';
import { levelSpec } from '../lib/levels';
import { PREDICTION_EMOJI, PREDICTION_LABEL } from '../lib/scoring';
import { makeCloze } from '../lib/text';
import { currentTest, nextTestStep, remaining, updateTest, type FlowState } from '../flow/state';
import type { Update } from '../flow/useFlow';

const noPaste = (e: ClipboardEvent) => e.preventDefault();

export function TestScreen({ state, update, now }: { state: FlowState; update: Update; now: number }) {
  const c = currentTest(state);
  const step = state.testStep;
  const paused = !!state.pausedAt;
  const rem = remaining(state, now);
  const total = (state.deadline ?? 0) - state.stepStartedAt;
  const key = `${state.testIndex}:${step}`;

  const next = () => {
    const k = key;
    update((s) => (`${s.testIndex}:${s.testStep}` === k && s.phase === 'test' ? nextTestStep(s, Date.now()) : s));
  };

  const timeUp = rem !== null && rem <= 0 && !paused;
  useEffect(() => {
    if (timeUp) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  if (step === 'intro' || !c) {
    return (
      <div className="rise space-y-5">
        <div>
          <div className="text-[13px] font-semibold text-ink-3">마지막 단계</div>
          <h1 className="mt-1 text-2xl font-bold">방금 쓴 두 글에 대해 물어볼게요</h1>
        </div>
        <Card className="space-y-2 text-[15px] leading-relaxed text-ink-2">
          <p>글마다 질문이 4개 있어요. 글은 다시 볼 수 없어요.</p>
          <p>정확하지 않아도 괜찮아요. 기억나는 만큼만 답해 주세요.</p>
        </Card>
        <Button size="lg" block onClick={next}>
          시작하기
        </Button>
      </div>
    );
  }

  const t = state.tests[c]!;
  const topic = topicById(t.topicId);
  const label = `${topic.short} 글`;

  return (
    <div className="rise space-y-4" key={key}>
      <div className="sticky top-0 z-10 -mx-4 bg-paper/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm font-bold">🗂 {label}</span>
          <span className="text-sm font-semibold text-ink-3">
            글 {state.testIndex + 1} / {state.testOrder.length}
          </span>
        </div>
        {rem !== null ? <TimerBar remainingMs={rem} totalMs={total} paused={paused} /> : <div className="h-[18px]" />}
      </div>

      {step === 'predict' && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold leading-snug">
            "{topic.question}"
            <br />
            <span className="text-ink-2">이 주제로 낸 글, 얼마나 기억날 것 같아요?</span>
          </h2>
          <div className="grid gap-2">
            {([1, 2, 3] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  update((s) => updateTest(s, { prediction: v }));
                  next();
                }}
                className="flex items-center gap-4 rounded-2xl border border-line-2 bg-card px-5 py-4 text-left text-lg font-semibold transition hover:bg-paper active:scale-[0.99]"
              >
                <span className="text-3xl">{PREDICTION_EMOJI[v]}</span>
                {PREDICTION_LABEL[v]}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'quote' && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold leading-snug">
            제출한 {label}의 <u className="decoration-2 underline-offset-4">첫 문장</u>을 기억나는 대로 써 보세요.
          </h2>
          <textarea
            autoFocus
            value={t.quote}
            onChange={(e) => update((s) => updateTest(s, { quote: e.target.value, quoteGaveUp: false }))}
            onPaste={noPaste}
            rows={3}
            className="w-full resize-none rounded-2xl border border-line-2 bg-card p-4 text-[16px] leading-relaxed outline-none focus:border-ink"
            placeholder="생각나는 단어만 써도 괜찮아요."
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                update((s) => updateTest(s, { quote: '', quoteGaveUp: true }));
                next();
              }}
            >
              전혀 기억나지 않아요
            </Button>
            <Button className="flex-1" onClick={next} disabled={!t.quote.trim()}>
              다음
            </Button>
          </div>
        </div>
      )}

      {step === 'cloze' && (
        <ClozeStep
          text={state.writings[c]?.text ?? ''}
          blanks={levelSpec(state.level).clozeBlanks}
          answers={t.clozeAnswers}
          update={update}
          onNext={next}
          label={label}
        />
      )}

      {step === 'own' && <OwnStep label={label} value={t.ownership} update={update} onNext={next} />}
    </div>
  );
}

function ClozeStep({
  text,
  blanks,
  answers,
  update,
  onNext,
  label,
}: {
  text: string;
  blanks: number;
  answers: string[];
  update: Update;
  onNext: () => void;
  label: string;
}) {
  const cloze = useMemo(() => makeCloze(text, blanks), [text, blanks]);
  if (!cloze) return null;
  const set = (i: number, v: string) =>
    update((s) => {
      const c = currentTest(s)!;
      const arr = [...s.tests[c]!.clozeAnswers];
      arr[i] = v;
      return updateTest(s, { clozeAnswers: arr });
    });
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold leading-snug">{label}의 나머지 문장이에요. 빈칸에 들어갈 말을 채워 보세요.</h2>
      <Card className="text-[17px] leading-[2.6]">
        {cloze.parts.map((p, i) =>
          p.type === 'text' ? (
            <span key={i}>{p.text}</span>
          ) : (
            <input
              key={i}
              value={answers[p.index] ?? ''}
              onChange={(e) => set(p.index, e.target.value)}
              onPaste={noPaste}
              aria-label={`빈칸 ${p.index + 1}`}
              autoFocus={p.index === 0}
              autoComplete="off"
              spellCheck={false}
              className="mx-1 inline-block rounded-lg border-b-2 border-ink bg-paper px-2 py-0.5 text-center text-[16px] leading-normal outline-none focus:bg-self-soft"
              style={{ width: `${Math.max(3.2, p.len + 1.6)}em` }}
            />
          ),
        )}
      </Card>
      <Button size="lg" block onClick={onNext}>
        다음
      </Button>
    </div>
  );
}

function OwnStep({ label, value, update, onNext }: { label: string; value: number | null; update: Update; onNext: () => void }) {
  const [v, setV] = useState(value ?? 50);
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold leading-snug">{label}은 얼마나 "내 글"처럼 느껴지나요?</h2>
      <Card className="space-y-4">
        <div className="text-center text-5xl font-bold tabular">{v}</div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={v}
          onChange={(e) => setV(Number(e.target.value))}
          className="w-full"
          aria-label="내 글이라는 느낌 0에서 100"
        />
        <div className="flex justify-between text-sm text-ink-3">
          <span>전혀 내 글 같지 않다</span>
          <span>완전히 내 글이다</span>
        </div>
      </Card>
      <Button
        size="lg"
        block
        className={cx()}
        onClick={() => {
          update((s) => updateTest(s, { ownership: v }));
          onNext();
        }}
      >
        다음
      </Button>
    </div>
  );
}
