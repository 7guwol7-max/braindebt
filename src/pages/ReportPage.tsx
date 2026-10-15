import { useEffect, useState } from 'react';
import { api } from '../api';
import { errorText } from '../api/types';
import { CountUp, Histogram, MetricBars, Scatter } from '../components/charts';
import { RecallOverlay } from '../components/textviz';
import { Button, Card, CondBadge, Page, Spinner, cx } from '../components/ui';
import type { ReportSnapshot } from '../lib/aggregate';
import { MIT_FACT } from '../lib/content';
import { DISCUSSION_QUESTIONS } from '../lib/share';

export function ReportPage({ id }: { id: string }) {
  const [data, setData] = useState<{ r: ReportSnapshot; at: string } | null | undefined>(undefined);
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .getReport(id)
      .then((x) => setData(x ? { r: x.snapshot as ReportSnapshot, at: x.created_at } : null))
      .catch((e) => {
        setError(errorText(e));
        setData(null);
      });
  }, [id]);
  if (data === undefined) return <Spinner label="리포트를 불러오는 중…" />;
  if (data === null) {
    return (
      <Page>
        <Card className="mt-10 text-center text-ink-2">{error || '리포트를 찾을 수 없어요. 링크가 만료됐거나 삭제됐을 수 있어요.'}</Card>
      </Page>
    );
  }
  const { r } = data;
  const s = r.summary;
  return (
    <Page wide>
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink-3">
              수업 리포트 · {new Date(r.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <h1 className="mt-1 text-3xl font-bold">{r.name || '인지 부채 체험 수업'}</h1>
            <p className="mt-1 text-ink-2">
              참여 {r.participants}명 · 두 글을 모두 끝낸 학생 {s.n}명
            </p>
          </div>
          <Button variant="secondary" className="no-print" onClick={() => window.print()}>
            PDF로 저장 / 인쇄
          </Button>
        </div>

        <Card className="space-y-2 bg-ink text-white">
          <div className="text-sm font-semibold text-white/60">이 수업에서 한 일</div>
          <p className="text-[15px] leading-relaxed text-white/85">
            학생들은 짧은 글 두 편을 썼어요. 한 편은 혼자, 한 편은 AI 도우미와. 몇 분 뒤 글을 보지 않고 첫 문장을 떠올리고, 빈칸을 채우고,
            "내 글" 느낌을 답했어요. AI에게 생각을 맡기면 지금은 편하지만 기억과 주인의식으로 이자를 내게 된다는 것, 이것을{' '}
            <b>인지 부채</b>라고 불러요.
          </p>
          <p className="text-[13px] text-white/60">{MIT_FACT}</p>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {(['self', 'ai'] as const).map((c) => (
            <Card key={c} className={cx('p-6', c === 'self' ? 'bg-self-soft' : 'bg-ai-soft')}>
              <CondBadge c={c} />
              <div className="mt-3 text-6xl font-extrabold">
                <CountUp value={s[c].quoteSim} suffix="%" />
              </div>
              <div className="mt-1 text-ink-2">첫 문장 일치율 평균</div>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-4 font-bold">반 평균 비교</div>
            <MetricBars
              rows={[
                { label: '기억 점수', self: s.self.memory, ai: s.ai.memory, max: 100 },
                { label: '빈칸 정답률', self: s.self.clozePct, ai: s.ai.clozePct, max: 100, fmt: (v) => `${v}%` },
                { label: "'내 글' 느낌", self: s.self.ownership, ai: s.ai.ownership, max: 100 },
                { label: '시험 전 예상 점수', self: s.self.predicted, ai: s.ai.predicted, max: 100 },
              ]}
            />
          </Card>
          <Card className="space-y-4">
            <div className="font-bold">첫 문장 일치율 분포</div>
            <Histogram bins={s.hist.bins} self={s.hist.self} ai={s.hist.ai} />
            <ul className="space-y-1 text-[15px] text-ink-2">
              <li>
                부채가 있는 학생 <b className="text-ink">{s.debtShare}%</b>
              </li>
              <li>
                다른 친구 글과 거의 같은 글: AI <b className="text-ink">{s.dupRate.ai}%</b> · 직접 <b className="text-ink">{s.dupRate.self}%</b>
              </li>
              <li>
                평균 쓰기 시간: 직접 <b className="text-ink">{s.self.writeSec}초</b> · AI <b className="text-ink">{s.ai.writeSec}초</b>
              </li>
            </ul>
          </Card>
        </div>

        <Card className="space-y-3">
          <div className="font-bold">AI 초안을 고친 만큼 기억에 남았을까?</div>
          <Scatter points={s.scatter} />
          {s.editSplit.highN + s.editSplit.lowN > 0 && (
            <p className="text-[15px] text-ink-2">
              초안을 {s.editSplit.threshold}% 이상 고친 학생 {s.editSplit.highN}명의 AI 글 기억 점수는{' '}
              <b className="text-ink">{s.editSplit.highN ? `${s.editSplit.highMemory}점` : '-'}</b>, 덜 고친 학생 {s.editSplit.lowN}명은{' '}
              <b className="text-ink">{s.editSplit.lowN ? `${s.editSplit.lowMemory}점` : '-'}</b>이었어요.
            </p>
          )}
        </Card>

        {r.gallery.length > 0 && (
          <section className="print-break space-y-3">
            <h2 className="text-xl font-bold">겹쳐보기: 원문 위에 기억한 문장</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {r.gallery.map((g) => (
                <Card key={g.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <CondBadge c={g.condition} />
                    <span className="text-sm text-ink-3">
                      {g.topic} 글 · {g.sim}%
                    </span>
                  </div>
                  <RecallOverlay original={g.original} recalled={g.recalled} />
                </Card>
              ))}
            </div>
          </section>
        )}

        {r.quiz.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xl font-bold">누가 썼을까? 퀴즈</h2>
            {r.quiz.map((q, i) => (
              <Card key={i} className="space-y-3">
                <div className="flex items-center justify-between text-sm text-ink-3">
                  <span>
                    {i + 1}라운드 · {q.topic}
                  </span>
                  <span>
                    투표 {q.voters}명 · 모두 맞힘 <b className="text-ink">{q.allCorrectPct}%</b>
                  </span>
                </div>
                {q.cards.map((c, k) => (
                  <div key={k} className={cx('rounded-xl p-3 text-[15px]', c.ai ? 'bg-ai-soft' : 'bg-self-soft')}>
                    <div className="mb-1 flex items-center justify-between">
                      <CondBadge c={c.ai ? 'ai' : 'self'} short />
                      <span className="tabular text-[13px] text-ink-2">AI로 고른 비율 {c.pickPct}%</span>
                    </div>
                    {c.text}
                  </div>
                ))}
              </Card>
            ))}
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xl font-bold">토론 질문</h2>
          <Card className="space-y-2 text-[15px]">
            {DISCUSSION_QUESTIONS.map((q, i) => (
              <p key={q}>
                {i + 1}. {q}
              </p>
            ))}
          </Card>
        </section>

        {r.reflections.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xl font-bold">오늘 알게 된 것 ({r.reflections.length})</h2>
            <div className="columns-1 gap-3 sm:columns-2">
              {r.reflections.map((t, i) => (
                <div key={i} className="mb-3 break-inside-avoid rounded-2xl border border-line bg-card p-4 text-[15px]">
                  {t}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-xl font-bold">AI와 쓰더라도 "내 글"로 남기는 법</h2>
          <ol className="list-inside list-decimal space-y-1 text-[15px] text-ink-2">
            <li>먼저 내 생각을 3줄 쓰고, 그다음 AI에게 다듬어 달라고 하기</li>
            <li>AI 초안을 받으면 최소 한 문장은 내 말로 다시 쓰기</li>
            <li>제출 전에 글을 가리고 첫 문장을 말해 보기</li>
          </ol>
        </section>
        <p className="text-center text-[13px] text-ink-3">학생 이름은 담지 않았어요. 글은 공개에 동의한 학생의 것만 실었어요.</p>
      </div>
    </Page>
  );
}
