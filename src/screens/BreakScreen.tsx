import { useEffect, useMemo, useState } from 'react';
import { Card, TimerBar, cx } from '../components/ui';
import { SURVEY } from '../lib/content';
import { finishBreak, remaining, type FlowState } from '../flow/state';
import type { Update } from '../flow/useFlow';

function problem(seed: number) {
  const r = (n: number) => Math.floor(((Math.sin(seed * 9301 + n * 49297) + 1) / 2) * 1e6);
  const a = 12 + (r(1) % 38);
  const b = 11 + (r(2) % 38);
  const ans = a + b;
  const deltas = [0, (r(3) % 4) + 1, -((r(4) % 4) + 1)];
  const options = deltas.map((d) => ans + d).sort((x, y) => (r(5 + x) % 7) - (r(5 + y) % 7));
  return { a, b, ans, options: [...new Set(options)] };
}

/** 쉬는 시간 1분: 설문 4문항 + 계산 문제. 실제 목적은 방금 쓴 글을 바로 떠올리지 못하게 하는 방해 과제. */
export function BreakScreen({ state, update, now }: { state: FlowState; update: Update; now: number }) {
  const rem = remaining(state, now) ?? 0;
  const total = (state.deadline ?? 0) - state.stepStartedAt;
  const paused = !!state.pausedAt;
  const answered = SURVEY.every((q) => state.survey[q.id]);
  const [k, setK] = useState(state.distractor.total);
  const [flash, setFlash] = useState<'ok' | 'no' | null>(null);
  const p = useMemo(() => problem(state.seed + k * 17), [state.seed, k]);

  const timeUp = rem <= 0 && !paused && state.deadline !== null;
  useEffect(() => {
    if (!timeUp) return;
    const dl = state.deadline;
    update((s) => (s.phase === 'break' && s.deadline === dl ? finishBreak(s, Date.now()) : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  const pick = (v: number) => {
    const ok = v === p.ans;
    setFlash(ok ? 'ok' : 'no');
    update((s) => ({ ...s, distractor: { correct: s.distractor.correct + (ok ? 1 : 0), total: s.distractor.total + 1 } }));
    setTimeout(() => {
      setFlash(null);
      setK((x) => x + 1);
    }, 350);
  };

  return (
    <div className="rise space-y-4">
      <div className="sticky top-0 z-10 -mx-4 bg-paper/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm font-bold">☕ 잠깐 쉬어 가요</span>
          <span className="text-sm text-ink-3">끝나면 자동으로 넘어가요</span>
        </div>
        <TimerBar remainingMs={rem} totalMs={total} paused={paused} />
      </div>

      {!answered ? (
        <div className="space-y-3">
          <p className="text-[15px] text-ink-2">평소 AI 사용 습관을 알려 주세요. 정답은 없어요.</p>
          {SURVEY.map((q, i) => (
            <Card key={q.id} className="p-4">
              <div className="mb-3 font-semibold">
                {i + 1}. {q.text}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {q.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => update((s) => ({ ...s, survey: { ...s.survey, [q.id]: o } }))}
                    className={cx(
                      'rounded-xl border px-3 py-2.5 text-sm font-medium transition active:scale-[0.98]',
                      state.survey[q.id] === o ? 'border-ink bg-ink text-white' : 'border-line-2 bg-card hover:bg-paper',
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="space-y-5 text-center">
          <div>
            <div className="text-[13px] font-semibold text-ink-3">두뇌 체조 🧠</div>
            <p className="mt-1 text-sm text-ink-2">남은 시간 동안 계산해 보세요.</p>
          </div>
          <div className={cx('text-5xl font-bold tabular transition', flash === 'ok' && 'text-good', flash === 'no' && 'text-bad')}>
            {p.a} + {p.b}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {p.options.map((o) => (
              <button
                key={o}
                type="button"
                disabled={flash !== null}
                onClick={() => pick(o)}
                className="h-14 rounded-xl border border-line-2 bg-card text-xl font-bold tabular hover:bg-paper active:scale-95"
              >
                {o}
              </button>
            ))}
          </div>
          <div className="text-sm text-ink-3">
            맞힌 문제 <b className="tabular text-ink">{state.distractor.correct}</b>개
          </div>
        </Card>
      )}
    </div>
  );
}
