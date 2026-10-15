import { useEffect, type ReactNode } from 'react';
import { useNow } from '../components/ui';
import { BillScreen } from '../screens/BillScreen';
import { BreakScreen } from '../screens/BreakScreen';
import { IntroScreen } from '../screens/IntroScreen';
import { TestScreen } from '../screens/TestScreen';
import { WriteScreen } from '../screens/WriteScreen';
import { pause, resume, startWriting, type FlowState } from './state';
import type { Update } from './useFlow';

export function Experience({
  state,
  update,
  paused = false,
  waitingForStart = false,
  billExtra,
}: {
  state: FlowState;
  update: Update;
  paused?: boolean;
  waitingForStart?: boolean;
  billExtra?: ReactNode;
}) {
  const timed = state.deadline !== null;
  const now = useNow(250, timed);

  useEffect(() => {
    update((s) => (paused ? pause(s, Date.now()) : resume(s, Date.now())));
  }, [paused, update]);

  let body: ReactNode;
  switch (state.phase) {
    case 'intro':
      body = (
        <IntroScreen
          nickname={state.nickname}
          writeSeconds={state.writeSeconds}
          waiting={waitingForStart}
          onStart={() => update((s) => (s.phase === 'intro' ? startWriting(s, Date.now()) : s))}
        />
      );
      break;
    case 'write1':
    case 'write2':
      body = <WriteScreen key={state.phase} state={state} update={update} now={now} />;
      break;
    case 'break':
      body = <BreakScreen state={state} update={update} now={now} />;
      break;
    case 'test':
      body = <TestScreen state={state} update={update} now={now} />;
      break;
    case 'bill':
      body = state.result ? (
        <BillScreen result={state.result} nickname={state.nickname}>
          {billExtra}
        </BillScreen>
      ) : null;
      break;
  }

  return (
    <>
      {body}
      {paused && state.phase !== 'bill' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-paper/90 p-6 backdrop-blur-sm">
          <div className="pop text-center">
            <div className="text-5xl">⏸</div>
            <div className="mt-3 text-xl font-bold">선생님이 잠시 멈췄어요</div>
            <p className="mt-1 text-ink-2">타이머도 함께 멈춰 있어요.</p>
          </div>
        </div>
      )}
    </>
  );
}
