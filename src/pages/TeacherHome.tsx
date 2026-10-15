import { useState, type FormEvent, type ReactNode } from 'react';
import { api, isDemo } from '../api';
import { errorText, type Mode, type SessionSettings } from '../api/types';
import { Button, Card, Page, cx } from '../components/ui';
import { PAIRS } from '../lib/content';
import { randomInt } from '../lib/random';
import { fmtSec } from '../lib/scoring';
import { save } from '../lib/storage';
import { go } from '../router';
import { forgetSession, mySessions, rememberSession, tokenKey } from '../teacher/useTeacher';

function Choice<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; sub?: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-xl border px-3 py-2.5 text-left text-sm transition',
            value === o.value ? 'border-ink bg-ink text-white' : 'border-line-2 bg-card hover:bg-paper',
          )}
        >
          <div className="font-semibold">{o.label}</div>
          {o.sub && <div className={cx('mt-0.5 text-xs', value === o.value ? 'text-white/70' : 'text-ink-3')}>{o.sub}</div>}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-bold">{label}</div>
      {children}
      {hint && <div className="text-[13px] text-ink-3">{hint}</div>}
    </div>
  );
}

export function TeacherHome() {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('sync');
  const [pairId, setPairId] = useState('random');
  const [writeSeconds, setWriteSeconds] = useState(120);
  const [retentionDays, setRetentionDays] = useState(30);
  const [shareAllowed, setShareAllowed] = useState(true);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [list, setList] = useState(mySessions);
  const [loginCode, setLoginCode] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const settings: SessionSettings = {
        mode,
        pairId: pairId === 'random' ? PAIRS[randomInt(PAIRS.length)].id : pairId,
        writeSeconds,
        retentionDays,
        shareAllowed,
      };
      const { code, token } = await api.createSession(name.trim(), settings, pin);
      save(tokenKey(code), token);
      rememberSession({ code, name: name.trim(), createdAt: new Date().toISOString() });
      go(`/t/${code}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const token = await api.teacherLogin(loginCode, loginPin);
      save(tokenKey(loginCode), token);
      const pub = await api.sessionPublic(loginCode);
      rememberSession({ code: loginCode, name: pub?.name ?? '', createdAt: new Date().toISOString() });
      go(`/t/${loginCode}`);
    } catch (err) {
      setLoginError(errorText(err));
    }
  };

  return (
    <Page>
      <div className="rise space-y-6 pt-2">
        <button type="button" onClick={() => go('/')} className="text-sm font-semibold text-ink-3">
          ← 처음으로
        </button>
        <div>
          <div className="text-[13px] font-semibold text-ink-3">교수자</div>
          <h1 className="mt-1 text-[28px] font-bold">인지 부채 체험 수업</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            학생들이 짧은 글 두 편을 써요. 한 편은 혼자, 한 편은 AI 도우미와. 몇 분 뒤 기억 시험에서 두 글의 차이를 직접 겪어요.
          </p>
        </div>

        <Card className="space-y-3 bg-paper">
          <div className="font-bold">수업 순서 (약 17분)</div>
          <ol className="space-y-1.5 text-[15px] text-ink-2">
            <li>1. 학생 입장: QR이나 6자리 코드 (1분)</li>
            <li>2. 각자 10분 체험: 글쓰기 2편 → 쉬는 시간 → 기억 시험 → 청구서</li>
            <li>3. 함께 나눠보기 7분: 반 결과 → 겹쳐보기 → 누가 썼을까? 퀴즈 → 토론·소감</li>
          </ol>
          <p className="text-[13px] text-ink-3">
            학생에게는 "짧은 글쓰기 실험"이라고만 안내해 주세요. 기억 시험과 "인지 부채"라는 이름은 결과 화면에서 공개돼요.
          </p>
          <Button variant="secondary" size="sm" onClick={() => go('/solo')}>
            수업 전에 나 먼저 10분 체험하기 →
          </Button>
        </Card>

        <Card>
          <form onSubmit={create} className="space-y-5">
            <h2 className="text-lg font-bold">새 수업 만들기</h2>
            <Field label="수업 이름 (선택)">
              <input
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 2학년 3반 국어"
                className="h-12 w-full rounded-xl border border-line-2 bg-paper px-4 text-[16px] outline-none focus:border-ink"
              />
            </Field>
            <Field label="진행 방식">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    ['sync', '교실에서 함께 (권장)', '선생님이 "모두 시작"을 누르면 다 같이 시작해요.'],
                    ['async', '각자 진행 (과제·원격)', '링크를 받은 학생이 아무 때나 10분 체험해요.'],
                  ] as const
                ).map(([v, label, sub]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMode(v)}
                    className={cx(
                      'rounded-xl border p-3 text-left transition',
                      mode === v ? 'border-ink bg-ink text-white' : 'border-line-2 bg-card hover:bg-paper',
                    )}
                  >
                    <div className="font-semibold">{label}</div>
                    <div className={cx('mt-1 text-[13px]', mode === v ? 'text-white/70' : 'text-ink-3')}>{sub}</div>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="주제 쌍" hint="학생마다 두 주제 중 어느 쪽을 혼자/AI와 쓸지는 무작위로 정해져요.">
              <Choice
                value={pairId}
                onChange={setPairId}
                options={[{ value: 'random', label: '무작위' }, ...PAIRS.map((p) => ({ value: p.id, label: p.label }))]}
              />
            </Field>
            <Field label="글쓰기 시간 (한 편당)">
              <Choice
                value={writeSeconds}
                onChange={setWriteSeconds}
                options={[90, 120, 150, 180].map((v) => ({ value: v, label: fmtSec(v), sub: v === 120 ? '권장' : undefined }))}
              />
            </Field>
            <Field label="데이터 보관 기간" hint="기간이 지나면 학생 글과 결과가 자동으로 삭제돼요. 언제든 직접 삭제할 수 있어요.">
              <Choice value={retentionDays} onChange={setRetentionDays} options={[7, 30, 90].map((v) => ({ value: v, label: `${v}일` }))} />
            </Field>
            <label className="flex items-start gap-3 rounded-xl bg-paper p-3 text-[15px]">
              <input
                type="checkbox"
                checked={shareAllowed}
                onChange={(e) => setShareAllowed(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-[var(--color-ink)]"
              />
              <span>
                <b>수업 중 글 공유 허용</b>
                <span className="block text-[13px] text-ink-3">동의한 학생의 글을 이름 없이 겹쳐보기·퀴즈에 써요. 끄면 반 평균만 보여 줘요.</span>
              </span>
            </label>
            <Field label="진행 PIN (숫자 4~8자리)" hint="다른 기기(교실 PC 등)에서 이 수업을 열 때 필요해요. 학생에게 알려 주지 마세요.">
              <input
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="예: 4821"
                className="tabular h-12 w-full rounded-xl border border-line-2 bg-paper px-4 text-[16px] tracking-widest outline-none focus:border-ink"
              />
            </Field>
            {error && <p className="text-sm text-bad">{error}</p>}
            <Button size="lg" block type="submit" disabled={busy || pin.length < 4}>
              {busy ? '만드는 중…' : '수업 만들기'}
            </Button>
          </form>
        </Card>

        {list.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-bold">이 기기에서 만든 수업</h2>
            {list.map((s) => (
              <div key={s.code} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4">
                <button type="button" className="flex-1 text-left" onClick={() => go(`/t/${s.code}`)}>
                  <div className="font-semibold">{s.name || '이름 없는 수업'}</div>
                  <div className="tabular text-sm text-ink-3">
                    코드 {s.code} · {new Date(s.createdAt).toLocaleDateString('ko-KR')}
                  </div>
                </button>
                <Button size="sm" variant="secondary" onClick={() => go(`/t/${s.code}`)}>
                  열기
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="목록에서 지우기"
                  onClick={() => {
                    forgetSession(s.code);
                    setList(mySessions());
                  }}
                >
                  ✕
                </Button>
              </div>
            ))}
          </section>
        )}

        <Card>
          <form onSubmit={login} className="space-y-3">
            <h2 className="font-bold">다른 기기에서 만든 수업 열기</h2>
            <div className="grid grid-cols-2 gap-2">
              <input
                inputMode="numeric"
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="수업 코드"
                className="tabular h-12 rounded-xl border border-line-2 bg-paper px-4 text-[16px] outline-none focus:border-ink"
              />
              <input
                inputMode="numeric"
                type="password"
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="진행 PIN"
                className="tabular h-12 rounded-xl border border-line-2 bg-paper px-4 text-[16px] outline-none focus:border-ink"
              />
            </div>
            {loginError && <p className="text-sm text-bad">{loginError}</p>}
            <Button variant="secondary" block type="submit" disabled={loginCode.length !== 6 || loginPin.length < 4}>
              열기
            </Button>
            {isDemo && <p className="text-[13px] text-ink-3">데모 모드에서는 같은 브라우저에서 만든 수업만 열 수 있어요.</p>}
          </form>
        </Card>
      </div>
    </Page>
  );
}
