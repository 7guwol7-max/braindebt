// 학생 폰의 "함께 보기" 화면: 교수자가 발표 화면을 넘기면 따라 바뀐다.
import { useState } from 'react';
import { api } from '../api';
import { errorText, type Cred } from '../api/types';
import { load, save } from '../lib/storage';
import { DISCUSSION_QUESTIONS, type ShareState } from '../lib/share';
import type { ResultPayload } from '../lib/types';
import { Histogram, MetricBars } from './charts';
import { RecallOverlay } from './textviz';
import { Button, Card, CondBadge, Eyebrow, cx, useToast } from './ui';

export function Together({ share, mine, cred }: { share: Exclude<ShareState, { step: 'none' }>; mine: ResultPayload | null; cred: Cred }) {
  const s = share.summary;
  return (
    <div className="rise space-y-5" key={share.step + ('key' in share ? share.key : '')}>
      {share.step === 'gallery' && (
        <div className="space-y-3">
          <Eyebrow>큰 화면을 봐 주세요 👀</Eyebrow>
          {share.item ? (
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <CondBadge c={share.item.condition} />
                <span className="text-sm text-ink-3">
                  {share.item.topic} 글 · 일치율 {share.item.sim}%
                </span>
              </div>
              <RecallOverlay original={share.item.original} recalled={share.item.recalled} />
            </Card>
          ) : (
            <Card className="text-ink-2">소개할 글을 고르는 중이에요.</Card>
          )}
        </div>
      )}

      {share.step === 'quiz' && <QuizVote share={share} cred={cred} />}

      {(share.step === 'discuss' || share.step === 'wall') && <Reflect cred={cred} />}

      {share.step === 'results' && (
        <div className="space-y-4">
          <div>
            <Eyebrow>우리 반 결과 · {s.n}명</Eyebrow>
            <h2 className="mt-1 text-2xl font-bold">첫 문장을 얼마나 기억했을까?</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['self', 'ai'] as const).map((c) => (
              <Card key={c} className={cx('p-4 text-center', c === 'self' ? 'bg-self-soft' : 'bg-ai-soft')}>
                <CondBadge c={c} short />
                <div className="tabular mt-2 text-4xl font-extrabold">{s[c].quoteSim}%</div>
                <div className="text-[13px] text-ink-2">반 평균 일치율</div>
                {mine && <div className="tabular mt-1 text-sm font-semibold">나: {mine.metrics[c].quoteSim}%</div>}
              </Card>
            ))}
          </div>
          <Card>
            <div className="mb-2 font-bold">반 전체 분포에서 내 위치</div>
            <Histogram
              bins={s.hist.bins}
              self={s.hist.self}
              ai={s.hist.ai}
              markers={mine?.metrics.comparable ? { self: mine.metrics.self.quoteSim, ai: mine.metrics.ai.quoteSim } : undefined}
              height={240}
            />
          </Card>
          <Card>
            <div className="mb-4 font-bold">반 평균</div>
            <MetricBars
              rows={[
                { label: '기억 점수', self: s.self.memory, ai: s.ai.memory, max: 100 },
                { label: '빈칸 정답률', self: s.self.clozePct, ai: s.ai.clozePct, max: 100, fmt: (v) => `${v}%` },
                { label: "'내 글' 느낌", self: s.self.ownership, ai: s.ai.ownership, max: 100 },
              ]}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function QuizVote({ share, cred }: { share: Extract<ShareState, { step: 'quiz' }>; cred: Cred }) {
  const toast = useToast();
  const storeKey = `bd:vote:${cred.pid}:${share.key}`;
  const [picked, setPicked] = useState<string[]>(() => load<string[]>(storeKey) ?? []);
  const [sent, setSent] = useState<string[] | null>(() => load<string[]>(storeKey));
  const [busy, setBusy] = useState(false);
  const answer = new Set(share.answer ?? []);
  const toggle = (id: string) => {
    if (share.reveal) return;
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= share.pick ? [...p.slice(1), id] : [...p, id]));
  };
  const submit = async () => {
    setBusy(true);
    try {
      await api.vote(cred, share.key, picked);
      save(storeKey, picked);
      setSent(picked);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const allRight = sent && sent.length === answer.size && sent.every((x) => answer.has(x));
  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>
          누가 썼을까? · {share.round} / {share.rounds} 라운드 · {share.topic}
        </Eyebrow>
        <h2 className="mt-1 text-xl font-bold leading-snug">
          {share.reveal ? '정답 공개!' : `AI와 함께 쓴 글 ${share.pick}편을 골라 보세요`}
        </h2>
      </div>
      <div className="space-y-2">
        {share.cards.map((c, i) => {
          const on = picked.includes(c.id);
          const isAi = answer.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className={cx(
                'w-full rounded-2xl border-2 bg-card p-4 text-left text-[15px] leading-relaxed transition',
                !share.reveal && (on ? 'border-ink' : 'border-line'),
                share.reveal && (isAi ? 'border-ai bg-ai-soft' : 'border-self bg-self-soft'),
              )}
            >
              <div className="mb-1.5 flex items-center justify-between text-sm font-bold">
                <span>{'①②③④'[i]}</span>
                {share.reveal ? <CondBadge c={isAi ? 'ai' : 'self'} short /> : on && <span>✓ 선택</span>}
              </div>
              {c.text}
              {share.reveal && sent?.includes(c.id) && <div className="mt-2 text-sm font-semibold text-ink-2">내가 고른 글</div>}
            </button>
          );
        })}
      </div>
      {share.reveal ? (
        <Card className="text-center font-bold">
          {sent ? (allRight ? '🎉 모두 맞혔어요!' : '아쉬워요. 다음 라운드에 도전해요!') : '이번 라운드는 투표하지 않았어요.'}
        </Card>
      ) : (
        <Button size="lg" block disabled={picked.length !== share.pick || busy} onClick={submit}>
          {sent ? '다시 제출하기' : '제출하기'}
        </Button>
      )}
      {sent && !share.reveal && <p className="text-center text-sm text-ink-3">제출했어요. 정답 공개를 기다려요.</p>}
    </div>
  );
}

function Reflect({ cred }: { cred: Cred }) {
  const toast = useToast();
  const storeKey = `bd:reflect:${cred.code}:${cred.pid}`;
  const [mine, setMine] = useState<string[]>(() => load<string[]>(storeKey) ?? []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      await api.reflect(cred, t);
      const next = [...mine, t];
      setMine(next);
      save(storeKey, next);
      setText('');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>함께 이야기해요</Eyebrow>
        <h2 className="mt-1 text-xl font-bold">오늘 알게 된 것 한 줄</h2>
      </div>
      <Card className="space-y-2 text-[15px] text-ink-2">
        {DISCUSSION_QUESTIONS.map((q, i) => (
          <p key={q}>
            {i + 1}. {q}
          </p>
        ))}
      </Card>
      {mine.length < 3 ? (
        <div className="space-y-2">
          <textarea
            value={text}
            maxLength={120}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="예: AI 글은 읽기만 해서 기억이 안 났다"
            className="w-full resize-none rounded-2xl border border-line-2 bg-card p-4 text-[16px] outline-none focus:border-ink"
          />
          <Button size="lg" block disabled={!text.trim() || busy} onClick={send}>
            큰 화면에 보내기 (이름 없이)
          </Button>
        </div>
      ) : (
        <Card className="text-center text-ink-2">소감은 3개까지 보낼 수 있어요. 고마워요!</Card>
      )}
      {mine.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-ink-3">내가 보낸 소감</div>
          {mine.map((m, i) => (
            <div key={i} className="rounded-xl bg-card px-4 py-3 text-[15px]">
              ✓ {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
