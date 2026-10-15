import { useState, type FormEvent } from 'react';
import { Button, Card, Page } from '../components/ui';
import { go } from '../router';

export function HomePage() {
  const [code, setCode] = useState('');
  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    if (code.length === 6) go(`/join/${code}`);
  };
  return (
    <Page>
      <div className="rise space-y-6 pt-6">
        <div>
          <div className="text-4xl">✍️</div>
          <h1 className="mt-3 text-[30px] font-bold leading-tight">10분 글쓰기 실험</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">짧은 글 두 편을 쓰고, 몇 가지 질문에 답해요. 약 10분 걸려요.</p>
        </div>

        <Card>
          <form onSubmit={onJoin} className="space-y-3">
            <label htmlFor="code" className="block font-bold">
              수업 코드로 참여하기
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="선생님이 알려 준 6자리 숫자"
              className="tabular h-14 w-full rounded-xl border border-line-2 bg-paper px-4 text-center text-2xl font-bold tracking-[0.3em] outline-none placeholder:text-base placeholder:font-normal placeholder:tracking-normal focus:border-ink"
            />
            <Button size="lg" block type="submit" disabled={code.length !== 6}>
              참여하기
            </Button>
          </form>
        </Card>

        <Button variant="secondary" size="lg" block onClick={() => go('/solo')}>
          혼자 체험하기
        </Button>

        <div className="border-t border-line pt-5 text-center">
          <button type="button" onClick={() => go('/teach')} className="text-[15px] font-semibold text-ink-2 underline underline-offset-4">
            선생님이신가요? 수업 만들기 · 내 수업 관리
          </button>
        </div>
      </div>
    </Page>
  );
}
