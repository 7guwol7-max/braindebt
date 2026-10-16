import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { errorText, type SessionPublic } from '../api/types';
import { Button, Card, Page, Spinner } from '../components/ui';
import type { Level } from '../lib/levels';
import { loadTabFirst, saveBoth } from '../lib/storage';
import { go } from '../router';

export interface StoredCred {
  pid: string;
  secret: string;
  nickname: string;
  spectator: boolean;
  pairId: string;
  writeSeconds: number;
  mode: 'sync' | 'async';
  level?: Level;
}

export const credKey = (code: string) => `bd:cred:${code}`;

export function JoinPage({ code: initial }: { code?: string }) {
  const [code, setCode] = useState(initial ?? '');
  const [session, setSession] = useState<SessionPublic | null | undefined>(undefined);
  const [nickname, setNickname] = useState('');
  const [consent, setConsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existing = code.length === 6 ? loadTabFirst<StoredCred>(credKey(code)) : null;

  useEffect(() => {
    if (code.length !== 6) {
      setSession(undefined);
      return;
    }
    let alive = true;
    setSession(undefined);
    api
      .sessionPublic(code)
      .then((s) => alive && setSession(s))
      .catch((e) => {
        if (!alive) return;
        setSession(null);
        setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [code]);

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!session || !nickname.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.join(code, nickname, consent);
      const cred: StoredCred = {
        pid: r.participant_id,
        secret: r.secret,
        nickname: r.nickname,
        spectator: r.spectator,
        pairId: session.settings.pairId,
        writeSeconds: session.settings.writeSeconds,
        mode: session.settings.mode,
        level: session.settings.level ?? 'elem',
      };
      saveBoth(credKey(code), cred);
      go(`/c/${code}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <div className="rise space-y-5 pt-4">
        <button type="button" onClick={() => go('/')} className="text-sm font-semibold text-ink-3">
          ← 처음으로
        </button>
        <h1 className="text-[26px] font-bold">수업 참여하기</h1>
        {!initial && (
          <input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6자리 수업 코드"
            className="tabular h-14 w-full rounded-xl border border-line-2 bg-card px-4 text-center text-2xl font-bold tracking-[0.3em] outline-none focus:border-ink"
            aria-label="수업 코드"
          />
        )}
        {code.length === 6 && session === undefined && !error && <Spinner label="수업을 찾는 중…" />}
        {session === null && <Card className="text-center text-ink-2">{error || '수업을 찾을 수 없어요. 코드를 다시 확인해 주세요.'}</Card>}
        {existing && session && (
          <Card className="space-y-3 border-good/40 bg-good-soft">
            <p className="font-semibold">{existing.nickname} 님으로 이미 참여했어요.</p>
            <Button block onClick={() => go(`/c/${code}`)}>
              이어서 하기
            </Button>
          </Card>
        )}
        {session && (
          <Card>
            <div className="mb-4">
              <div className="text-[13px] font-semibold text-ink-3">수업 코드 {code}</div>
              <div className="text-lg font-bold">{session.name || '글쓰기 실험 수업'}</div>
              {session.stage === 'closed' && <p className="mt-2 text-bad">이미 끝난 수업이에요.</p>}
              {session.stage === 'running' && session.settings.mode === 'sync' && (
                <p className="mt-2 text-sm text-warn">이미 시작한 수업이에요. 지금 들어오면 큰 화면을 함께 보는 관전 모드로 참여해요.</p>
              )}
            </div>
            <form onSubmit={onJoin} className="space-y-4">
              <div>
                <label htmlFor="nick" className="mb-1.5 block text-sm font-semibold text-ink-2">
                  닉네임
                </label>
                <input
                  id="nick"
                  autoFocus
                  maxLength={12}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="선생님이 알아볼 수 있는 이름"
                  className="h-12 w-full rounded-xl border border-line-2 bg-paper px-4 text-[16px] outline-none focus:border-ink"
                />
              </div>
              <label className="flex items-start gap-3 rounded-xl bg-paper p-3 text-sm leading-relaxed text-ink-2">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--color-ink)]" />
                <span>
                  내 글과 결과가 <b className="text-ink">이름 없이</b> 수업 화면에 소개될 수 있어요. 체크를 풀면 반 평균에만 들어가요.
                </span>
              </label>
              {error && <p className="text-sm text-bad">{error}</p>}
              <Button size="lg" block type="submit" disabled={busy || !nickname.trim() || session.stage === 'closed'}>
                {busy ? '들어가는 중…' : '참여하기'}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </Page>
  );
}
