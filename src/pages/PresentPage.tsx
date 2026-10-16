// 발표 모드: 프로젝터용 큰 화면. 한 장씩 넘기면 학생 폰의 "함께 보기" 화면도 따라 바뀐다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, isDemo } from '../api';
import { errorText, type TeacherSnapshot } from '../api/types';
import { CountUp, Histogram, MetricBars, Scatter } from '../components/charts';
import { QR } from '../components/QR';
import { RecallOverlay } from '../components/textviz';
import { Button, CondBadge, Modal, Spinner, cx, useToast } from '../components/ui';
import { PHASE_LABELS, buildGallery, buildQuizPlan, buildReport, phaseCounts, quizStats, summarize } from '../lib/aggregate';
import { randomId, randomInt } from '../lib/random';
import { DISCUSSION_QUESTIONS, SHARE_STEPS, type QuizRoundPlan, type ShareState, type ShareStep, type TeacherState } from '../lib/share';
import { levelSpec } from '../lib/levels';
import { appUrl, go, openNew } from '../router';
import { TeacherGate } from '../teacher/TeacherGate';
import { useTeacher } from '../teacher/useTeacher';

export function PresentPage({ code }: { code: string }) {
  return <TeacherGate code={code}>{(token) => <Present code={code} token={token} />}</TeacherGate>;
}

function quizState(plan: QuizRoundPlan[], i: number, reveal: boolean, summary: ReturnType<typeof summarize>): ShareState {
  const r = plan[i];
  return {
    step: 'quiz',
    summary,
    key: r.key,
    round: i + 1,
    rounds: plan.length,
    topic: r.topic,
    cards: r.cards,
    pick: r.aiIds.length,
    reveal,
    ...(reveal ? { answer: r.aiIds } : {}),
  };
}

function Present({ code, token }: { code: string; token: string }) {
  const t = useTeacher(code, token);
  const toast = useToast();
  const snap = t.snap;
  const summary = useMemo(() => (snap ? summarize(snap.results, snap.participants) : null), [snap]);
  const [busy, setBusy] = useState(false);

  const share = snap?.session.share_state ?? { step: 'none' as const };
  const ts: TeacherState = snap?.session.teacher_state ?? {};
  const allowed = snap?.session.settings.shareAllowed !== false;
  const steps = SHARE_STEPS.filter((x) => allowed || (x.step !== 'gallery' && x.step !== 'quiz'));
  const idx = steps.findIndex((x) => x.step === share.step);

  const publish = useCallback(
    async (state: ShareState, teacherState?: TeacherState) => {
      setBusy(true);
      try {
        await t.patch({ share_state: state, ...(teacherState ? { teacher_state: teacherState } : {}) });
      } catch (e) {
        toast(errorText(e));
      } finally {
        setBusy(false);
      }
    },
    [t, toast],
  );

  const goStep = useCallback(
    async (step: ShareStep) => {
      if (!snap || !summary) return;
      if (step === 'none') return publish({ step: 'none' });
      if (step === 'gallery') {
        const gallery = ts.gallery?.length ? ts.gallery : buildGallery(snap.results, snap.participants);
        return publish({ step, summary, item: gallery[0] ?? null, index: 0, total: gallery.length }, { ...ts, gallery });
      }
      if (step === 'quiz') {
        const quiz = ts.quiz?.plan?.length
          ? ts.quiz
          : (() => {
              const planId = randomId(6);
              return {
                planId,
                plan: buildQuizPlan(snap.results, snap.participants, planId, randomInt(1 << 20), 3, snap.session.settings.level),
              };
            })();
        if (quiz.plan.length === 0) return publish({ step: 'discuss', summary });
        return publish(quizState(quiz.plan, 0, false, summary), { ...ts, quiz });
      }
      return publish({ step, summary } as ShareState);
    },
    [snap, summary, ts, publish],
  );

  const next = useCallback(() => {
    if (busy) return;
    if (idx < steps.length - 1) void goStep(steps[idx + 1].step);
  }, [busy, idx, steps, goStep]);
  const prev = useCallback(() => {
    if (busy) return;
    void goStep(idx <= 0 ? 'none' : steps[idx - 1].step);
  }, [busy, idx, steps, goStep]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') next();
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [next, prev]);

  // 결과가 더 모이면 공유 중인 요약을 새로 고친다.
  const lastN = useRef<number | null>(null);
  useEffect(() => {
    if (!summary || share.step === 'none' || !('summary' in share)) return;
    if (share.summary.n === summary.n || lastN.current === summary.n) return;
    lastN.current = summary.n;
    const tm = setTimeout(() => void publish({ ...share, summary } as ShareState), 1500);
    return () => clearTimeout(tm);
  }, [summary, share, publish]);

  if (t.authFailed) {
    return <div className="flex min-h-dvh items-center justify-center bg-paper text-xl">{t.error}</div>;
  }
  if (!snap || !summary) return <Spinner label="불러오는 중…" />;
  const s = snap.session;
  const counts = phaseCounts(snap.participants);

  let slide;
  if (share.step === 'none') {
    slide =
      s.stage === 'lobby' ? (
        <Lobby snap={snap} code={code} onStart={() => t.patch({ stage: 'running' })} />
      ) : (
        <Progress snap={snap} code={code} onPause={() => t.patch({ paused: !s.paused })} />
      );
  } else if (share.step === 'results') {
    slide = <Results summary={summary} />;
  } else if (share.step === 'gallery') {
    const gallery = ts.gallery ?? [];
    const show = (i: number) => publish({ ...share, item: gallery[i] ?? null, index: i, total: gallery.length });
    slide = (
      <div className="space-y-8">
        <SlideTitle eyebrow={`겹쳐보기 ${gallery.length ? share.index + 1 : 0} / ${gallery.length}`} title="방금 쓴 글의 첫 문장, 기억했을까?" />
        {share.item ? (
          <div className="rise space-y-6 rounded-3xl border border-line bg-card p-10" key={share.item.id}>
            <div className="flex items-center gap-3 text-lg">
              <CondBadge c={share.item.condition} />
              <span className="text-ink-3">
                {share.item.topic} 글 · 일치율 <b className="tabular text-ink">{share.item.sim}%</b>
              </span>
            </div>
            <RecallOverlay original={share.item.original} recalled={share.item.recalled} big />
          </div>
        ) : (
          <Empty text="소개할 글이 없어요. 공개에 동의한 학생의 글이 필요해요." />
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={share.index <= 0} onClick={() => show(share.index - 1)}>
            ◀ 이전 글
          </Button>
          <Button variant="secondary" disabled={share.index >= gallery.length - 1} onClick={() => show(share.index + 1)}>
            다음 글 ▶
          </Button>
          <Button variant="ghost" disabled={gallery.length < 2} onClick={() => show(randomInt(gallery.length))}>
            🎲 무작위
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const g = buildGallery(snap.results, snap.participants);
              void publish({ ...share, item: g[0] ?? null, index: 0, total: g.length }, { ...ts, gallery: g });
            }}
          >
            최신 결과로 새로 고침
          </Button>
        </div>
      </div>
    );
  } else if (share.step === 'quiz') {
    const plan = ts.quiz?.plan ?? [];
    const round = plan[share.round - 1];
    const stats = round ? quizStats(round, snap.votes) : null;
    const active = snap.participants.filter((p) => !p.kicked).length;
    slide = round ? (
      <div className="space-y-6">
        <SlideTitle
          eyebrow={`누가 썼을까? · ${share.round} / ${share.rounds} 라운드 · ${share.topic}`}
          title={share.reveal ? '정답 공개!' : `이 중 AI와 함께 쓴 글 ${share.pick}편은?`}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {round.cards.map((c, i) => {
            const isAi = round.aiIds.includes(c.id);
            const pct = stats?.pickPct[c.id] ?? 0;
            return (
              <div
                key={c.id}
                className={cx(
                  'rounded-3xl border-2 bg-card p-6 transition',
                  share.reveal ? (isAi ? 'border-ai bg-ai-soft' : 'border-self bg-self-soft') : 'border-line',
                )}
              >
                <div className="mb-3 flex items-center justify-between text-lg font-bold">
                  <span>{'①②③④'[i]}</span>
                  {share.reveal && <CondBadge c={isAi ? 'ai' : 'self'} />}
                </div>
                <p className={cx('leading-relaxed', c.text.length > 220 ? 'text-base' : c.text.length > 140 ? 'text-lg' : 'text-xl')}>{c.text}</p>
                {share.reveal && (
                  <div className="mt-4 flex items-center gap-3">
                    <div className="h-4 flex-1 rounded-r-[4px] bg-black/5">
                      <div className="h-full rounded-r-[4px] bg-ink transition-[width] duration-700" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tabular w-36 whitespace-nowrap text-right text-base font-semibold">AI로 고른 {pct}%</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="tabular text-lg text-ink-2">
            투표 <b className="text-ink">{stats?.voters ?? 0}</b> / {active}명
          </span>
          {share.reveal && stats && <span className="text-lg font-bold">모두 맞힌 사람 {stats.allCorrectPct}%</span>}
          <span className="flex-1" />
          {!share.reveal ? (
            <Button size="lg" onClick={() => publish(quizState(plan, share.round - 1, true, summary))}>
              정답 공개
            </Button>
          ) : share.round < share.rounds ? (
            <Button size="lg" onClick={() => publish(quizState(plan, share.round, false, summary))}>
              다음 라운드 ▶
            </Button>
          ) : (
            <Button size="lg" onClick={next}>
              토론으로 ▶
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              const planId = randomId(6);
              const quiz = {
                planId,
                plan: buildQuizPlan(snap.results, snap.participants, planId, randomInt(1 << 20), 3, snap.session.settings.level),
              };
              if (quiz.plan.length) void publish(quizState(quiz.plan, 0, false, summary), { ...ts, quiz });
            }}
          >
            새 문제 만들기
          </Button>
        </div>
      </div>
    ) : (
      <Empty text="퀴즈를 만들 글이 부족해요. 공개에 동의한 학생의 직접 쓴 글이 필요해요." />
    );
  } else if (share.step === 'discuss') {
    slide = <Discuss summary={summary} />;
  } else {
    slide = <Wall snap={snap} code={code} token={token} refresh={t.refresh} />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="no-print flex flex-wrap items-center gap-3 border-b border-line bg-card px-6 py-3">
        <span className="tabular text-lg font-extrabold tracking-[0.12em]">{code}</span>
        <span className="text-sm text-ink-3">
          참여 {counts.total}명 · 완료 {counts.done}명
        </span>
        <nav className="mx-auto flex flex-wrap gap-1">
          <StepPill active={share.step === 'none'} onClick={() => goStep('none')}>
            {s.stage === 'lobby' ? '입장' : '진행'}
          </StepPill>
          {steps.map((x) => (
            <StepPill key={x.step} active={share.step === x.step} onClick={() => goStep(x.step)} disabled={snap.results.length === 0}>
              {x.label}
            </StepPill>
          ))}
        </nav>
        <Button size="sm" variant="ghost" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
          전체 화면
        </Button>
        <Button size="sm" variant="ghost" onClick={() => go(`/t/${code}`)}>
          콘솔
        </Button>
      </header>
      {isDemo && share.step === 'none' && (
        <div className="no-print bg-warn-soft px-6 py-1.5 text-center text-[13px] text-ink-2">데모 모드: 이 브라우저의 다른 탭에서 학생으로 참여해 보세요.</div>
      )}
      <main className="mx-auto w-full max-w-7xl flex-1 px-8 py-10">{slide}</main>
      <footer className="no-print flex items-center justify-between border-t border-line bg-card px-6 py-3">
        <Button variant="secondary" onClick={prev} disabled={busy || share.step === 'none'}>
          ← 이전
        </Button>
        <span className="text-sm text-ink-3">키보드 ← → 로도 넘길 수 있어요 · 학생 폰도 함께 바뀌어요</span>
        <Button onClick={next} disabled={busy || idx >= steps.length - 1 || snap.results.length === 0}>
          {share.step === 'none' ? '반 결과 공개 →' : '다음 →'}
        </Button>
      </footer>
    </div>
  );
}

function StepPill({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'rounded-full px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-30',
        active ? 'bg-ink text-white' : 'text-ink-2 hover:bg-paper',
      )}
    >
      {children}
    </button>
  );
}

function SlideTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="text-lg font-semibold text-ink-3">{eyebrow}</div>
      <h1 className="mt-1 text-4xl font-bold leading-tight lg:text-5xl">{title}</h1>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-3xl border border-dashed border-line-2 bg-card p-16 text-center text-xl text-ink-2">{text}</div>;
}

function Lobby({ snap, code, onStart }: { snap: TeacherSnapshot; code: string; onStart: () => Promise<void> }) {
  const url = appUrl(`/join/${code}`);
  const people = snap.participants.filter((p) => !p.kicked && !p.spectator);
  const sync = snap.session.settings.mode === 'sync';
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[auto_1fr]">
      <div className="space-y-4 rounded-3xl border border-line bg-card p-8 text-center">
        <div className="text-lg font-semibold text-ink-3">폰 카메라로 찍거나 코드를 입력하세요</div>
        <QR text={url} size={300} className="mx-auto" />
        <div className="tabular text-7xl font-extrabold tracking-[0.12em]">{code}</div>
        <div className="max-w-[320px] break-all text-sm text-ink-3">{url}</div>
      </div>
      <div className="space-y-6">
        <SlideTitle
          eyebrow={`${snap.session.name || '글쓰기 실험'} · ${levelSpec(snap.session.settings.level).label}`}
          title={`들어온 사람 ${people.length}명`}
        />
        <div className="flex flex-wrap gap-2">
          {people.map((p) => (
            <span key={p.id} className="pop rounded-full bg-card px-4 py-2 text-lg font-semibold shadow-sm">
              {p.nickname}
            </span>
          ))}
        </div>
        {sync ? (
          <Button size="lg" onClick={() => void onStart()} disabled={people.length === 0}>
            ▶ 모두 시작
          </Button>
        ) : (
          <p className="text-lg text-ink-2">각자 진행하는 수업이에요. 들어온 학생은 바로 시작할 수 있어요.</p>
        )}
      </div>
    </div>
  );
}

function Progress({ snap, code, onPause }: { snap: TeacherSnapshot; code: string; onPause: () => Promise<void> }) {
  const c = phaseCounts(snap.participants);
  const vals = [c.lobby, c.write1, c.write2, c.rest, c.test, c.done];
  const max = Math.max(1, c.total);
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_auto]">
      <div className="space-y-8">
        <SlideTitle eyebrow="각자 체험 중" title={snap.session.paused ? '⏸ 잠시 멈췄어요' : '글을 쓰고, 기억을 시험하는 중 ✍️'} />
        <div className="space-y-3">
          {PHASE_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-4">
              <span className="w-28 text-lg font-semibold text-ink-2">{label}</span>
              <div className="h-7 flex-1">
                <div
                  className={cx('h-full rounded-r-[4px] transition-[width] duration-700', i === 5 ? 'bg-good' : 'bg-ink')}
                  style={{ width: `max(${(vals[i] / max) * 100}%, ${vals[i] ? 6 : 0}px)` }}
                />
              </div>
              <span className="tabular w-14 text-right text-xl font-bold">{vals[i]}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold">
            완료 <span className="tabular">{c.done}</span> / {c.total}명
          </span>
          {snap.session.settings.mode === 'sync' && (
            <Button variant="secondary" onClick={() => void onPause()}>
              {snap.session.paused ? '▶ 다시 시작' : '⏸ 일시 정지'}
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-2 text-center">
        <QR text={appUrl(`/join/${code}`)} size={140} className="mx-auto" />
        <div className="tabular text-2xl font-extrabold tracking-[0.12em]">{code}</div>
      </div>
    </div>
  );
}

function Results({ summary: s }: { summary: ReturnType<typeof summarize> }) {
  if (s.n === 0) return <Empty text="아직 끝낸 학생이 없어요." />;
  return (
    <div className="space-y-10">
      <SlideTitle eyebrow={`우리 반 결과 · ${s.n}명`} title="방금 쓴 글의 첫 문장, 얼마나 기억했을까?" />
      <div className="grid gap-6 lg:grid-cols-2">
        {(['self', 'ai'] as const).map((c) => (
          <div key={c} className={cx('rounded-3xl p-8', c === 'self' ? 'bg-self-soft' : 'bg-ai-soft')}>
            <CondBadge c={c} />
            <div className="mt-4 text-8xl font-extrabold">
              <CountUp value={s[c].quoteSim} suffix="%" />
            </div>
            <div className="mt-2 text-xl text-ink-2">첫 문장 일치율 평균</div>
          </div>
        ))}
      </div>
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="rounded-3xl border border-line bg-card p-8">
          <MetricBars
            big
            rows={[
              { label: '기억 점수', self: s.self.memory, ai: s.ai.memory, max: 100 },
              { label: '빈칸 정답률', self: s.self.clozePct, ai: s.ai.clozePct, max: 100, fmt: (v) => `${v}%` },
              { label: "'내 글' 느낌", self: s.self.ownership, ai: s.ai.ownership, max: 100 },
            ]}
          />
        </div>
        <div className="space-y-6 rounded-3xl border border-line bg-card p-8">
          <div className="text-xl font-bold">첫 문장 일치율 분포</div>
          <Histogram bins={s.hist.bins} self={s.hist.self} ai={s.hist.ai} height={260} />
          <ul className="space-y-2 text-lg">
            <li>
              🧾 부채가 있는 학생 <b className="tabular">{s.debtShare}%</b>
            </li>
            <li>
              🤖 AI와 쓴 글 중 다른 친구 글과 거의 같은 글 <b className="tabular">{s.dupRate.ai}%</b>{' '}
              <span className="text-ink-3">(직접 쓴 글 {s.dupRate.self}%)</span>
            </li>
            <li>
              😎 시험 전 AI 글 예상 <b className="tabular">{s.ai.predicted}점</b> → 실제 <b className="tabular">{s.ai.memory}점</b>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Discuss({ summary: s }: { summary: ReturnType<typeof summarize> }) {
  const e = s.editSplit;
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div className="space-y-6">
        <SlideTitle eyebrow="함께 이야기해요" title="왜 이런 차이가 났을까?" />
        <ol className="space-y-5">
          {DISCUSSION_QUESTIONS.map((q, i) => (
            <li key={q} className="flex gap-4 text-2xl leading-snug">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-lg font-bold text-white">{i + 1}</span>
              <span className="pt-0.5">{q}</span>
            </li>
          ))}
        </ol>
        <p className="text-lg text-ink-3">학생 폰에서 한 줄 소감을 보낼 수 있어요.</p>
      </div>
      <div className="space-y-4 rounded-3xl border border-line bg-card p-8">
        <div className="text-xl font-bold">AI 초안을 고친 만큼 기억에 남았을까?</div>
        <Scatter points={s.scatter} height={320} />
        {e.highN + e.lowN > 0 && (
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl bg-paper p-4">
              <div className="text-sm text-ink-3">
                {e.threshold}% 이상 고친 학생 {e.highN}명
              </div>
              <div className="tabular text-3xl font-bold">{e.highN ? `${e.highMemory}점` : '-'}</div>
            </div>
            <div className="rounded-2xl bg-paper p-4">
              <div className="text-sm text-ink-3">
                덜 고친 학생 {e.lowN}명
              </div>
              <div className="tabular text-3xl font-bold">{e.lowN ? `${e.lowMemory}점` : '-'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Wall({ snap, code, token, refresh }: { snap: TeacherSnapshot; code: string; token: string; refresh: () => Promise<void> }) {
  const toast = useToast();
  const [report, setReport] = useState<string | null>(null);
  const kicked = new Set(snap.participants.filter((p) => p.kicked).map((p) => p.id));
  const items = snap.reflections.filter((r) => !kicked.has(r.participant_id));
  const shown = items.filter((r) => !r.hidden);
  const hidden = items.filter((r) => r.hidden);
  const hide = async (id: string, h: boolean) => {
    try {
      await api.teacherHideReflection(code, token, id, h);
      await refresh();
    } catch (e) {
      toast(errorText(e));
    }
  };
  const makeReport = async () => {
    try {
      const snapshot = buildReport(snap.session, snap.participants, snap.results, snap.votes, snap.reflections);
      const id = await api.teacherCreateReport(code, token, snapshot);
      await api.teacherUpdate(code, token, { teacher_state: { ...snap.session.teacher_state, reportId: id } });
      setReport(id);
    } catch (e) {
      toast(errorText(e));
    }
  };
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SlideTitle eyebrow={`소감 ${shown.length}개 · 폰에서 보내 주세요`} title="오늘 알게 된 것" />
        <Button size="lg" onClick={makeReport}>
          수업 리포트 만들기
        </Button>
      </div>
      {shown.length === 0 ? (
        <Empty text="아직 소감이 없어요. 폰에서 한 줄 소감을 보내 주세요." />
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
          {shown.map((r) => (
            <div key={r.id} className="pop group relative mb-4 break-inside-avoid rounded-2xl border border-line bg-card p-5 text-xl leading-relaxed">
              {r.text}
              <button
                type="button"
                onClick={() => hide(r.id, true)}
                className="no-print absolute right-2 top-2 rounded-lg px-2 py-1 text-xs text-ink-3 opacity-0 transition hover:bg-paper group-hover:opacity-100"
              >
                숨기기
              </button>
            </div>
          ))}
        </div>
      )}
      {hidden.length > 0 && (
        <div className="no-print text-sm text-ink-3">
          숨긴 소감 {hidden.length}개 ·{' '}
          <button type="button" className="underline" onClick={() => hidden.forEach((r) => void hide(r.id, false))}>
            모두 다시 보이기
          </button>
        </div>
      )}
      <Modal open={!!report} onClose={() => setReport(null)} title="수업 리포트가 준비됐어요">
        {report && (
          <div className="space-y-4 text-center">
            <QR text={appUrl(`/r/${report}`)} size={220} className="mx-auto" />
            <div className="break-all text-sm text-ink-3">{appUrl(`/r/${report}`)}</div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => navigator.clipboard.writeText(appUrl(`/r/${report}`)).then(() => toast('링크를 복사했어요.'), () => {})}>
                링크 복사
              </Button>
              <Button className="flex-1" onClick={() => openNew(`/r/${report}`)}>
                열기 ↗
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
