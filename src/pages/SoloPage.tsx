import { useCallback, useEffect } from 'react';
import { Button, Page, cx } from '../components/ui';
import { Experience } from '../flow/Experience';
import { createFlow, setLevel } from '../flow/state';
import { useFlow } from '../flow/useFlow';
import { LEVEL_ORDER, LEVELS, isLevel, type Level } from '../lib/levels';
import { load, save } from '../lib/storage';
import { go } from '../router';

const LEVEL_KEY = 'bd:solo-level';

export function SoloPage({ level: routeLevel }: { level?: string }) {
  const preferred: Level = isLevel(routeLevel) ? routeLevel : (load<Level>(LEVEL_KEY) ?? 'elem');
  const init = useCallback(() => createFlow({ nickname: '', level: preferred }), [preferred]);
  const [state, update, reset] = useFlow('bd:flow:solo', init);

  // 주소로 수준이 정해져 오면(예: 교수자 "나 먼저 체험") 시작 전 상태에 반영한다.
  useEffect(() => {
    if (isLevel(routeLevel)) update((s) => setLevel(s, routeLevel));
  }, [routeLevel, update]);

  const choose = (lv: Level) => {
    save(LEVEL_KEY, lv);
    update((s) => setLevel(s, lv));
  };

  return (
    <Page>
      {state.phase === 'intro' && (
        <div className="mb-5 space-y-4">
          <div>
            <div className="mb-1.5 text-sm font-semibold text-ink-2">누가 체험하나요?</div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="수준">
              {LEVEL_ORDER.map((lv) => (
                <button
                  key={lv}
                  type="button"
                  role="radio"
                  aria-checked={state.level === lv}
                  onClick={() => choose(lv)}
                  className={cx(
                    'rounded-xl border px-2 py-2.5 text-center transition',
                    state.level === lv ? 'border-ink bg-ink text-white' : 'border-line-2 bg-card hover:bg-paper',
                  )}
                >
                  <div className="text-[15px] font-bold">{LEVELS[lv].label}</div>
                  <div className={cx('mt-0.5 text-[12px] leading-tight', state.level === lv ? 'text-white/70' : 'text-ink-3')}>
                    {LEVELS[lv].sentences}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink-2" htmlFor="nick">
              이름 또는 닉네임 (선택)
            </label>
            <input
              id="nick"
              maxLength={12}
              value={state.nickname}
              onChange={(e) => update((s) => ({ ...s, nickname: e.target.value }))}
              className="h-12 w-full rounded-xl border border-line-2 bg-card px-4 text-[16px] outline-none focus:border-ink"
              placeholder="결과 청구서에 표시돼요"
            />
          </div>
        </div>
      )}
      <Experience
        state={state}
        update={update}
        billExtra={
          <>
            <Button block onClick={reset}>
              처음부터 다시 하기
            </Button>
            <Button variant="ghost" block onClick={() => go('/teach')}>
              선생님이라면: 우리 반과 함께 해 보기
            </Button>
          </>
        }
      />
    </Page>
  );
}
