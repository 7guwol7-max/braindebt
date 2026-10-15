import { useCallback } from 'react';
import { Button, Page } from '../components/ui';
import { Experience } from '../flow/Experience';
import { createFlow } from '../flow/state';
import { useFlow } from '../flow/useFlow';
import { go } from '../router';

export function SoloPage() {
  const init = useCallback(() => createFlow({ nickname: '' }), []);
  const [state, update, reset] = useFlow('bd:flow:solo', init);
  return (
    <Page>
      {state.phase === 'intro' && (
        <div className="mb-5">
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
