import { useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api';
import { errorText } from '../api/types';
import { Button, Card, Page } from '../components/ui';
import { load, save } from '../lib/storage';
import { go } from '../router';
import { rememberSession, tokenKey } from './useTeacher';

/** 이 기기에 교수자 토큰이 없으면 PIN으로 로그인하게 한다. */
export function TeacherGate({ code, children }: { code: string; children: (token: string, logout: () => void) => ReactNode }) {
  const [token, setToken] = useState(() => load<string>(tokenKey(code)));
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  if (token) {
    return (
      <>
        {children(token, () => {
          save(tokenKey(code), null);
          setToken(null);
        })}
      </>
    );
  }
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const t = await api.teacherLogin(code, pin);
      save(tokenKey(code), t);
      const pub = await api.sessionPublic(code);
      rememberSession({ code, name: pub?.name ?? '', createdAt: new Date().toISOString() });
      setToken(t);
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <Page>
      <Card className="mt-10">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <div className="text-[13px] font-semibold text-ink-3">수업 코드 {code}</div>
            <h1 className="text-xl font-bold">진행 PIN을 입력해 주세요</h1>
          </div>
          <input
            autoFocus
            inputMode="numeric"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            className="tabular h-14 w-full rounded-xl border border-line-2 bg-paper px-4 text-center text-2xl tracking-[0.4em] outline-none focus:border-ink"
            aria-label="진행 PIN"
          />
          {error && <p className="text-sm text-bad">{error}</p>}
          <Button size="lg" block type="submit" disabled={pin.length < 4}>
            열기
          </Button>
          <Button variant="ghost" block onClick={() => go('/teach')}>
            교수자 홈으로
          </Button>
        </form>
      </Card>
    </Page>
  );
}
