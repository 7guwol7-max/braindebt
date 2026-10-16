import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { ApiError, type Cred, type SessionPublic } from '../api/types';
import { Together } from '../components/Together';
import { Button, Card, Page, Spinner, cx } from '../components/ui';
import { Experience } from '../flow/Experience';
import { createFlow, forceTo, phaseNum, progressOf, startWriting, type FlowState } from '../flow/state';
import { useFlow } from '../flow/useFlow';
import { load, loadTabFirst, save } from '../lib/storage';
import { go } from '../router';
import { credKey, type StoredCred } from './JoinPage';

export function ClassPage({ code }: { code: string }) {
  const [cred] = useState(() => loadTabFirst<StoredCred>(credKey(code)));
  useEffect(() => {
    if (!cred) go(`/join/${code}`);
  }, [cred, code]);
  if (!cred) return null;
  return <ClassRunner code={code} stored={cred} />;
}

function ClassRunner({ code, stored }: { code: string; stored: StoredCred }) {
  const cred: Cred = { code, pid: stored.pid, secret: stored.secret };
  const init = useCallback(
    () =>
      createFlow({ nickname: stored.nickname, pairId: stored.pairId, writeSeconds: stored.writeSeconds, level: stored.level ?? 'elem' }),
    [stored.nickname, stored.pairId, stored.writeSeconds, stored.level],
  );
  const [state, update] = useFlow(`bd:flow:${code}:${stored.pid}`, init);
  const [session, setSession] = useState<SessionPublic | null>(null);
  const [kicked, setKicked] = useState(false);
  const [gone, setGone] = useState(false);
  const [spectator, setSpectator] = useState(stored.spectator);
  const [offline, setOffline] = useState(false);
  const [view, setView] = useState<'mine' | 'together'>('mine');
  const stateRef = useRef<FlowState>(state);
  stateRef.current = state;
  const specRef = useRef(spectator);
  specRef.current = spectator;
  const lastBeat = useRef(0);

  const beat = useCallback(async () => {
    lastBeat.current = Date.now();
    const s = stateRef.current;
    try {
      const r = await api.heartbeat(cred, specRef.current ? null : phaseNum(s.phase), specRef.current ? null : progressOf(s, Date.now()));
      setSession(r.session);
      setKicked(r.kicked);
      setSpectator(r.spectator);
      setOffline(false);
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'unauthorized' || e.code === 'not_found')) setGone(true);
      else setOffline(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, stored.pid, stored.secret]);

  useEffect(() => {
    void beat();
    const t = setInterval(() => void beat(), 4000);
    const unsub = api.subscribe(code, (kind) => {
      if (kind === 'session' && Date.now() - lastBeat.current > 250) void beat();
    });
    return () => {
      clearInterval(t);
      unsub();
    };
  }, [beat, code]);

  // 단계가 바뀌면 바로 알린다(교수자 현황판이 즉시 갱신되도록).
  useEffect(() => {
    void beat();
    api.ping(code, 'participants');
  }, [state.phase, beat, code]);

  // 교수자 제어 반영: 동기 진행이면 "모두 시작"에 맞춰 시작, "늦은 학생 다음 단계로"에 맞춰 넘어가기.
  const stage = session?.stage;
  const force = session?.force_phase ?? 0;
  const mode = session?.settings.mode ?? stored.mode;
  useEffect(() => {
    if (!session || spectator) return;
    update((s) => {
      let next = s;
      if (mode === 'sync' && stage === 'running' && next.phase === 'intro') next = startWriting(next, Date.now());
      if (mode === 'sync' && force > phaseNum(next.phase)) next = forceTo(next, force, Date.now());
      return next;
    });
  }, [session, stage, force, mode, spectator, update]);

  // 결과 제출(실패하면 다음 하트비트 때 다시)
  const submittedKey = `bd:submitted:${code}:${stored.pid}`;
  const [submitted, setSubmitted] = useState(() => load<boolean>(submittedKey) === true);
  useEffect(() => {
    if (state.phase !== 'bill' || !state.result || submitted || spectator) return;
    let alive = true;
    const send = () =>
      api
        .submitResult(cred, state.result!)
        .then(() => {
          if (!alive) return;
          save(submittedKey, true);
          setSubmitted(true);
        })
        .catch(() => alive && setTimeout(send, 5000));
    send();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.result, submitted, spectator]);

  const share = session?.share_state;
  const shareKey = share ? share.step + ('key' in share ? share.key : '') + ('index' in share ? share.index : '') : '';
  // 교수자가 발표 화면을 넘기면 함께 보기로 바꾼다. 방금 시험을 끝낸 학생은 먼저 자기 청구서를 본다.
  useEffect(() => {
    if (share && share.step !== 'none' && stateRef.current.phase === 'bill') setView('together');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareKey]);
  useEffect(() => {
    if (state.phase === 'bill') setView('mine');
  }, [state.phase]);

  if (kicked) {
    return (
      <Page>
        <Card className="mt-10 text-center">
          <div className="text-4xl">🚪</div>
          <p className="mt-3 font-bold">수업에서 퇴장되었어요.</p>
          <p className="mt-1 text-ink-2">선생님께 말씀드리고 다시 참여해 주세요.</p>
          <Button className="mt-5" onClick={() => go(`/join/${code}`)}>
            다시 참여하기
          </Button>
        </Card>
      </Page>
    );
  }

  if (gone && state.phase !== 'bill') {
    return (
      <Page>
        <Card className="mt-10 text-center">
          <p className="font-bold">수업이 끝났거나 삭제되었어요.</p>
          <Button className="mt-5" onClick={() => go('/')}>
            처음으로
          </Button>
        </Card>
      </Page>
    );
  }

  if (!session && !gone) {
    return (
      <Page>
        <Spinner label="수업에 연결하는 중…" />
      </Page>
    );
  }

  const sharing = share && share.step !== 'none' ? share : null;

  if (spectator) {
    return (
      <Page>
        {sharing ? (
          <Together share={sharing} mine={null} cred={cred} />
        ) : (
          <Card className="mt-10 text-center">
            <div className="text-4xl">👀</div>
            <p className="mt-3 text-lg font-bold">이미 시작한 수업이에요</p>
            <p className="mt-1 text-ink-2">큰 화면을 함께 봐 주세요. 반 결과를 공개하면 여기에도 나와요.</p>
          </Card>
        )}
      </Page>
    );
  }

  const done = state.phase === 'bill';
  return (
    <Page>
      {offline && (
        <div className="mb-3 rounded-xl bg-warn-soft px-3 py-2 text-center text-sm text-ink-2">연결이 불안정해요. 계속 진행해도 괜찮아요.</div>
      )}
      {done && sharing && (
        <div className="sticky top-0 z-20 -mx-4 mb-4 bg-paper/95 px-4 py-2 backdrop-blur">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-line p-1">
            {(['together', 'mine'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cx('rounded-lg py-2 text-sm font-bold transition', view === v ? 'bg-card shadow-sm' : 'text-ink-2')}
              >
                {v === 'together' ? '함께 보기' : '내 청구서'}
              </button>
            ))}
          </div>
        </div>
      )}
      {done && sharing && view === 'together' ? (
        <Together share={sharing} mine={state.result} cred={cred} />
      ) : (
        <Experience
          state={state}
          update={update}
          paused={!!session?.paused && !done}
          waitingForStart={mode === 'sync' && stage === 'lobby'}
          billExtra={
            <Card className="text-center text-[15px] text-ink-2">
              {submitted ? '✓ 결과를 선생님께 보냈어요.' : '결과를 보내는 중…'}
              <br />
              선생님이 반 결과를 공개하면 여기에서 함께 볼 수 있어요.
            </Card>
          }
        />
      )}
    </Page>
  );
}
