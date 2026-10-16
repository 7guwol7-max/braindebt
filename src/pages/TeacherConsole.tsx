import { useMemo, useState } from 'react';
import { api, isDemo } from '../api';
import { errorText, type ParticipantRow, type ResultRow, type TeacherSnapshot } from '../api/types';
import { QR } from '../components/QR';
import { DraftDiff, RecallOverlay } from '../components/textviz';
import { Button, Card, CondBadge, Modal, Page, Spinner, cx, useToast } from '../components/ui';
import { PHASE_LABELS, buildReport, phaseCounts, summarize } from '../lib/aggregate';
import { SURVEY, pairById, topicById } from '../lib/content';
import { fmtSec } from '../lib/scoring';
import { firstSentence } from '../lib/text';
import { levelSpec } from '../lib/levels';
import { appUrl, go, openNew } from '../router';
import { buildRows, downloadCsv, downloadXlsx } from '../teacher/exports';
import { TeacherGate } from '../teacher/TeacherGate';
import { forgetSession, useTeacher } from '../teacher/useTeacher';

export function TeacherConsole({ code }: { code: string }) {
  return <TeacherGate code={code}>{(token, logout) => <Console code={code} token={token} logout={logout} />}</TeacherGate>;
}

function Console({ code, token, logout }: { code: string; token: string; logout: () => void }) {
  const t = useTeacher(code, token);
  const toast = useToast();
  const [tab, setTab] = useState<'operate' | 'collect'>('operate');
  const [qr, setQr] = useState(false);
  const joinUrl = appUrl(`/join/${code}`);

  if (t.authFailed) {
    return (
      <Page>
        <Card className="mt-10 space-y-4 text-center">
          <p className="font-bold">이 수업을 열 수 없어요.</p>
          <p className="text-ink-2">{t.error}</p>
          <Button onClick={logout}>PIN으로 다시 열기</Button>
          <Button variant="ghost" onClick={() => go('/teach')}>
            교수자 홈으로
          </Button>
        </Card>
      </Page>
    );
  }
  if (!t.snap) return <Page wide>{t.error ? <Card className="mt-10 text-center">{t.error}</Card> : <Spinner label="수업을 불러오는 중…" />}</Page>;

  const snap = t.snap;
  const s = snap.session;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      toast('참여 링크를 복사했어요.');
    } catch {
      toast(joinUrl);
    }
  };

  return (
    <Page wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button type="button" onClick={() => go('/teach')} className="text-sm font-semibold text-ink-3">
              ← 교수자 홈
            </button>
            <h1 className="mt-1 text-2xl font-bold">{s.name || '이름 없는 수업'}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <span className="tabular rounded-lg bg-card px-2.5 py-1 text-lg font-extrabold tracking-[0.15em] text-ink">{code}</span>
              <span>{levelSpec(s.settings.level).label}</span>
              <span>·</span>
              <span>{s.settings.mode === 'sync' ? '교실에서 함께' : '각자 진행'}</span>
              <span>·</span>
              <span>{pairById(s.settings.pairId).label}</span>
              <span>·</span>
              <span>{s.stage === 'lobby' ? '시작 전' : s.stage === 'running' ? '진행 중' : '종료'}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setQr(true)}>
              QR 크게 보기
            </Button>
            <Button variant="secondary" size="sm" onClick={copy}>
              참여 링크 복사
            </Button>
            <Button size="sm" onClick={() => openNew(`/t/${code}/present`)}>
              발표 모드 열기 ↗
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-line p-1 sm:w-80">
          {(
            [
              ['operate', '운영'],
              ['collect', '수합'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTab(v)}
              className={cx('rounded-lg py-2 text-sm font-bold transition', tab === v ? 'bg-card shadow-sm' : 'text-ink-2')}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'operate' ? (
          <Operate snap={snap} code={code} token={token} patch={t.patch} />
        ) : (
          <Collect snap={snap} code={code} token={token} refresh={t.refresh} />
        )}
      </div>

      <Modal open={qr} onClose={() => setQr(false)}>
        <div className="space-y-4 text-center">
          <QR text={joinUrl} size={300} className="mx-auto" />
          <div className="tabular text-5xl font-extrabold tracking-[0.15em]">{code}</div>
          <div className="break-all text-sm text-ink-3">{joinUrl}</div>
          {isDemo && <p className="text-[13px] text-warn">데모 모드: 이 브라우저의 다른 탭에서만 참여할 수 있어요.</p>}
          <Button block variant="secondary" onClick={() => setQr(false)}>
            닫기
          </Button>
        </div>
      </Modal>
    </Page>
  );
}

// ------------------------------------------------------------------ 운영

function Ring({ f, phase }: { f: number; phase: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const total = phase >= 5 ? 1 : Math.max(0, Math.min(1, (Math.max(0, phase - 1) + f) / 4));
  return (
    <svg width={38} height={38} viewBox="0 0 38 38" aria-hidden>
      <circle cx={19} cy={19} r={r} fill="none" stroke="var(--color-line)" strokeWidth={4} />
      <circle
        cx={19}
        cy={19}
        r={r}
        fill="none"
        stroke={phase >= 5 ? 'var(--color-good)' : 'var(--color-ink)'}
        strokeWidth={4}
        strokeDasharray={`${c * total} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 19 19)"
      />
    </svg>
  );
}

function Operate({
  snap,
  code,
  token,
  patch,
}: {
  snap: TeacherSnapshot;
  code: string;
  token: string;
  patch: (p: Parameters<typeof api.teacherUpdate>[2]) => Promise<void>;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<null | 'force' | 'close' | { kick: ParticipantRow }>(null);
  const s = snap.session;
  const counts = phaseCounts(snap.participants);
  const serverNow = Date.parse(snap.server_now);
  const active = snap.participants.filter((p) => !p.kicked && !p.spectator);
  const spectators = snap.participants.filter((p) => !p.kicked && p.spectator);
  const slowest = Math.min(...active.filter((p) => p.phase < 5).map((p) => p.phase), 5);
  const forceTarget = Math.max(s.force_phase, slowest + 1);
  const sync = s.settings.mode === 'sync';

  const run = async (p: Parameters<typeof api.teacherUpdate>[2], msg?: string) => {
    try {
      await patch(p);
      if (msg) toast(msg);
    } catch (e) {
      toast(errorText(e));
    }
  };

  const chips = [
    ['대기', counts.lobby],
    ['글쓰기 ①', counts.write1],
    ['글쓰기 ②', counts.write2],
    ['쉬는 시간', counts.rest],
    ['기억 시험', counts.test],
    ['완료', counts.done],
  ] as const;

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {chips.map(([label, n]) => (
            <span key={label} className={cx('rounded-full px-3 py-1.5 text-sm font-semibold', n > 0 ? 'bg-ink text-white' : 'bg-paper text-ink-3')}>
              {label} <span className="tabular">{n}</span>
            </span>
          ))}
          <span className="ml-auto text-sm text-ink-2">
            완료 <b className="tabular text-ink">{counts.done}</b> / {counts.total}명
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {sync && s.stage === 'lobby' && (
            <Button onClick={() => run({ stage: 'running' }, '모두 시작했어요.')} disabled={counts.total === 0}>
              ▶ 모두 시작
            </Button>
          )}
          {sync && s.stage === 'running' && (
            <Button variant="secondary" onClick={() => run({ paused: !s.paused }, s.paused ? '다시 시작했어요.' : '모두 멈췄어요.')}>
              {s.paused ? '▶ 다시 시작' : '⏸ 일시 정지'}
            </Button>
          )}
          {sync && s.stage === 'running' && slowest < 5 && (
            <Button variant="secondary" onClick={() => setConfirm('force')}>
              ⏭ 늦은 학생 다음 단계로
            </Button>
          )}
          <Button variant="secondary" onClick={() => openNew(`/t/${code}/present`)} disabled={snap.results.length === 0}>
            📊 반 결과 공개 (발표 모드)
          </Button>
          {s.stage !== 'closed' && (
            <Button variant="ghost" onClick={() => setConfirm('close')}>
              수업 종료
            </Button>
          )}
        </div>
        {s.paused && <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm">⏸ 일시 정지 중이에요. 학생 화면과 타이머가 멈춰 있어요.</p>}
        {s.stage === 'closed' && <p className="rounded-xl bg-paper px-3 py-2 text-sm text-ink-2">종료된 수업이에요. 새 학생은 들어올 수 없고, 결과는 그대로 남아 있어요.</p>}
      </Card>

      {active.length === 0 ? (
        <Card className="py-10 text-center text-ink-2">
          <div className="text-3xl">📱</div>
          <p className="mt-2 font-semibold">학생들이 QR이나 코드 {code}로 들어오면 여기에 나타나요.</p>
          {isDemo && <p className="mt-1 text-sm text-ink-3">데모: 새 탭에서 {appUrl(`/join/${code}`)} 를 열어 보세요.</p>}
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {active.map((p) => {
            const lost = serverNow - Date.parse(p.last_seen_at) > 20000 && p.phase < 5;
            const stuck = (p.phase === 1 || p.phase === 2) && (p.progress?.idle ?? 0) >= 60 && !s.paused;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setConfirm({ kick: p })}
                className={cx(
                  'flex items-center gap-3 rounded-2xl border-2 bg-card p-3 text-left transition hover:bg-paper',
                  stuck ? 'border-warn' : 'border-transparent',
                  lost && 'opacity-50',
                )}
                title="눌러서 퇴장시키기"
              >
                <Ring f={p.progress?.f ?? 0} phase={p.phase} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.nickname}</span>
                  <span className="block text-[13px] text-ink-3">
                    {lost ? '연결 끊김' : stuck ? '입력 멈춤' : PHASE_LABELS[p.phase]}
                    {!p.consent && ' · 비공개'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {spectators.length > 0 && (
        <p className="text-sm text-ink-3">
          관전 중 {spectators.length}명: {spectators.map((p) => p.nickname).join(', ')}
        </p>
      )}

      <Modal open={confirm === 'force'} onClose={() => setConfirm(null)} title="늦은 학생을 다음 단계로 넘길까요?">
        <p className="text-[15px] leading-relaxed text-ink-2">
          가장 느린 학생들({PHASE_LABELS[slowest]})을 <b className="text-ink">{PHASE_LABELS[Math.min(5, forceTarget)]}</b> 단계로 넘겨요. 쓰던 글은 쓴
          만큼 제출돼요.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>
            취소
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              setConfirm(null);
              void run({ force_phase: Math.min(5, forceTarget) }, '늦은 학생을 다음 단계로 넘겼어요.');
            }}
          >
            넘기기
          </Button>
        </div>
      </Modal>
      <Modal open={confirm === 'close'} onClose={() => setConfirm(null)} title="수업을 종료할까요?">
        <p className="text-[15px] text-ink-2">새 학생이 들어올 수 없게 돼요. 진행 중인 학생은 끝까지 할 수 있고, 결과는 그대로 남아요.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>
            취소
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              setConfirm(null);
              void run({ stage: 'closed' }, '수업을 종료했어요.');
            }}
          >
            종료
          </Button>
        </div>
      </Modal>
      <Modal open={!!confirm && typeof confirm === 'object'} onClose={() => setConfirm(null)} title="학생 퇴장">
        {confirm && typeof confirm === 'object' && (
          <>
            <p className="text-[15px] text-ink-2">
              <b className="text-ink">{confirm.kick.nickname}</b> 학생을 퇴장시킬까요? 집계와 발표 화면에서 빠져요.
            </p>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>
                취소
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={async () => {
                  const pid = confirm.kick.id;
                  setConfirm(null);
                  try {
                    await api.teacherKick(code, token, pid);
                  } catch (e) {
                    toast(errorText(e));
                  }
                }}
              >
                퇴장
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ 수합

type SortKey = 'nickname' | 'status' | 'selfMem' | 'aiMem' | 'debt' | 'edit' | 'selfQuote' | 'aiQuote' | 'aiTime';

function Collect({ snap, code, token, refresh }: { snap: TeacherSnapshot; code: string; token: string; refresh: () => Promise<void> }) {
  const toast = useToast();
  const [order, setOrder] = useState<'all' | 'self_first' | 'ai_first'>('all');
  const [edit, setEdit] = useState<'all' | 'low' | 'mid' | 'high'>('all');
  const [status, setStatus] = useState<'all' | 'done' | 'progress'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'nickname', dir: 1 });
  const [detail, setDetail] = useState<{ p: ParticipantRow; r: ResultRow | undefined } | null>(null);
  const [withTexts, setWithTexts] = useState(true);
  const [report, setReport] = useState<string | null>(snap.session.teacher_state?.reportId ?? null);
  const [del, setDel] = useState(false);
  const [delText, setDelText] = useState('');

  const resultBy = useMemo(() => new Map(snap.results.map((r) => [r.participant_id, r])), [snap.results]);
  const summary = useMemo(() => summarize(snap.results, snap.participants), [snap.results, snap.participants]);
  const visible = snap.participants.filter((p) => !p.kicked && !p.spectator);

  const rows = visible
    .map((p) => ({ p, r: resultBy.get(p.id) }))
    .filter(({ r }) => (status === 'all' ? true : status === 'done' ? !!r : !r))
    .filter(({ r }) => order === 'all' || r?.payload.order === order)
    .filter(({ r }) => {
      if (edit === 'all') return true;
      const e = r?.payload.metrics.ai.editRatio;
      if (e === null || e === undefined) return false;
      return edit === 'low' ? e < 10 : edit === 'mid' ? e >= 10 && e < 30 : e >= 30;
    });
  const val = (x: (typeof rows)[number], k: SortKey): number | string => {
    const m = x.r?.payload.metrics;
    switch (k) {
      case 'nickname':
        return x.p.nickname;
      case 'status':
        return x.r ? 1 : 0;
      case 'selfMem':
        return m?.self.memory ?? -1;
      case 'aiMem':
        return m?.ai.memory ?? -1;
      case 'debt':
        return m?.comparable ? m.debt : -999;
      case 'edit':
        return m?.ai.editRatio ?? -1;
      case 'selfQuote':
        return m?.self.quoteSim ?? -1;
      case 'aiQuote':
        return m?.ai.quoteSim ?? -1;
      case 'aiTime':
        return m?.ai.writeSec ?? -1;
    }
  };
  rows.sort((a, b) => {
    const va = val(a, sort.key);
    const vb = val(b, sort.key);
    return (typeof va === 'string' ? va.localeCompare(String(vb)) : va - (vb as number)) * sort.dir;
  });

  const th = (k: SortKey, label: string) => (
    <th className="whitespace-nowrap px-3 py-2.5 font-semibold">
      <button type="button" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }))}>
        {label}
        {sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );

  const fileName = `글쓰기실험_${snap.session.name || code}_${new Date().toISOString().slice(0, 10)}`;

  const makeReport = async () => {
    try {
      const snapshot = buildReport(snap.session, snap.participants, snap.results, snap.votes, snap.reflections);
      const id = await api.teacherCreateReport(code, token, snapshot);
      await api.teacherUpdate(code, token, { teacher_state: { ...snap.session.teacher_state, reportId: id } });
      setReport(id);
      toast('수업 리포트를 만들었어요.');
    } catch (e) {
      toast(errorText(e));
    }
  };

  const filterBtn = <T extends string>(cur: T, set: (v: T) => void, opts: [T, string][]) => (
    <div className="flex flex-wrap gap-1 rounded-xl bg-line p-1">
      {opts.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => set(v)}
          className={cx('rounded-lg px-3 py-1.5 text-[13px] font-semibold', cur === v ? 'bg-card shadow-sm' : 'text-ink-2')}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="완료 (비교 가능)" value={`${summary.n}명`} sub={`참여 ${visible.length}명`} />
        <Stat label="기억 점수 평균" value={`${summary.self.memory} → ${summary.ai.memory}`} sub="직접 → AI" />
        <Stat label="첫 문장 일치율 평균" value={`${summary.self.quoteSim}% → ${summary.ai.quoteSim}%`} sub="직접 → AI" />
        <Stat label="부채가 있는 학생" value={`${summary.debtShare}%`} sub={`AI 글 중복 ${summary.dupRate.ai}% · 직접 ${summary.dupRate.self}%`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filterBtn(status, setStatus, [
          ['all', '전체'],
          ['done', '완료'],
          ['progress', '진행 중'],
        ])}
        {filterBtn(order, setOrder, [
          ['all', '순서 전체'],
          ['self_first', '직접 먼저'],
          ['ai_first', 'AI 먼저'],
        ])}
        {filterBtn(edit, setEdit, [
          ['all', '수정 비율 전체'],
          ['low', '10% 미만'],
          ['mid', '10~30%'],
          ['high', '30% 이상'],
        ])}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[13px] text-ink-3">
              {th('nickname', '닉네임')}
              {th('status', '상태')}
              <th className="px-3 py-2.5 font-semibold">순서</th>
              {th('aiTime', '쓰기 시간 (직접/AI)')}
              {th('selfQuote', '첫 문장 직접')}
              {th('aiQuote', '첫 문장 AI')}
              <th className="px-3 py-2.5 font-semibold">빈칸</th>
              <th className="px-3 py-2.5 font-semibold">'내 글'</th>
              {th('selfMem', '기억 직접')}
              {th('aiMem', '기억 AI')}
              {th('debt', '부채')}
              {th('edit', '수정 비율')}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, r }) => {
              const m = r?.payload.metrics;
              return (
                <tr key={p.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-paper" onClick={() => setDetail({ p, r })}>
                  <td className="px-3 py-2.5 font-semibold">
                    {p.nickname}
                    {!p.consent && <span className="ml-1 text-[12px] font-normal text-ink-3">비공개</span>}
                  </td>
                  <td className="px-3 py-2.5">{r ? '완료' : PHASE_LABELS[p.phase]}</td>
                  <td className="px-3 py-2.5 text-ink-2">{r ? (r.payload.order === 'self_first' ? '직접 먼저' : 'AI 먼저') : ''}</td>
                  <td className="tabular px-3 py-2.5">{m ? `${fmtSec(m.self.writeSec)} / ${fmtSec(m.ai.writeSec)}` : ''}</td>
                  <td className="tabular px-3 py-2.5">{m ? `${m.self.quoteSim}%` : ''}</td>
                  <td className="tabular px-3 py-2.5">{m ? `${m.ai.quoteSim}%` : ''}</td>
                  <td className="tabular px-3 py-2.5">{m ? `${m.self.clozeCorrect}/${m.self.clozeTotal} · ${m.ai.clozeCorrect}/${m.ai.clozeTotal}` : ''}</td>
                  <td className="tabular px-3 py-2.5">{m ? `${m.self.ownership ?? '-'} · ${m.ai.ownership ?? '-'}` : ''}</td>
                  <td className="tabular px-3 py-2.5 font-semibold">{m?.self.memory ?? ''}</td>
                  <td className="tabular px-3 py-2.5 font-semibold">{m?.ai.memory ?? ''}</td>
                  <td className={cx('tabular px-3 py-2.5', m && !m.noDebt && m.comparable && 'font-bold')}>
                    {m ? (m.comparable ? (m.noDebt ? '0원' : `${m.debt}점`) : '-') : ''}
                  </td>
                  <td className="tabular px-3 py-2.5">{m ? (m.ai.editRatio === null ? 'AI 미사용' : `${m.ai.editRatio}%`) : ''}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-ink-3">
                  조건에 맞는 학생이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="space-y-3">
          <div className="font-bold">내보내기</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withTexts} onChange={(e) => setWithTexts(e.target.checked)} className="h-4 w-4 accent-[var(--color-ink)]" />
            학생 글 원문 포함
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => downloadCsv(buildRows(visible, snap.results, withTexts), fileName)}>
              CSV
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadXlsx(buildRows(visible, snap.results, withTexts), fileName).catch(() => toast('엑셀 파일을 만들지 못했어요.'))}
            >
              엑셀 (xlsx)
            </Button>
          </div>
        </Card>
        <Card className="space-y-3">
          <div className="font-bold">수업 리포트</div>
          <p className="text-[13px] text-ink-3">익명 집계·겹쳐보기·소감이 담긴 읽기 전용 페이지예요. 학생 복습, 동료 교사 공유, PDF 저장에 써요.</p>
          {report ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => openNew(`/r/${report}`)}>
                리포트 열기 ↗
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(appUrl(`/r/${report}`)).catch(() => {});
                  toast('리포트 링크를 복사했어요.');
                }}
              >
                링크 복사
              </Button>
              <Button size="sm" variant="ghost" onClick={makeReport}>
                최신 결과로 다시 만들기
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={makeReport} disabled={snap.results.length === 0}>
              리포트 링크 만들기
            </Button>
          )}
        </Card>
        <Card className="space-y-3">
          <div className="font-bold">데이터 보관</div>
          <p className="text-sm text-ink-2">
            {new Date(snap.session.expires_at).toLocaleDateString('ko-KR')}에 자동 삭제돼요.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await api.teacherExtend(code, token, 30);
                  await refresh();
                  toast('보관 기간을 30일 늘렸어요.');
                } catch (e) {
                  toast(errorText(e));
                }
              }}
            >
              30일 연장
            </Button>
            <Button size="sm" variant="ghost" className="text-bad!" onClick={() => setDel(true)}>
              지금 삭제
            </Button>
          </div>
        </Card>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.p.nickname}` : ''}>
        {detail && <Detail p={detail.p} r={detail.r} />}
      </Modal>

      <Modal open={del} onClose={() => setDel(false)} title="수업 데이터를 지금 삭제할까요?">
        <p className="text-[15px] leading-relaxed text-ink-2">
          학생 글, 결과, 투표, 소감, 수업 리포트가 모두 지워지고 되돌릴 수 없어요. 계속하려면 <b className="text-ink">삭제</b>라고 입력해 주세요.
        </p>
        <input
          value={delText}
          onChange={(e) => setDelText(e.target.value)}
          className="mt-3 h-12 w-full rounded-xl border border-line-2 bg-paper px-4 outline-none focus:border-ink"
        />
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setDel(false)}>
            취소
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={delText.trim() !== '삭제'}
            onClick={async () => {
              try {
                await api.teacherDelete(code, token);
                forgetSession(code);
                go('/teach');
              } catch (e) {
                toast(errorText(e));
              }
            }}
          >
            영구 삭제
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[13px] font-semibold text-ink-3">{label}</div>
      <div className="tabular mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-[13px] text-ink-3">{sub}</div>}
    </Card>
  );
}

function Detail({ p, r }: { p: ParticipantRow; r: ResultRow | undefined }) {
  if (!r) return <p className="text-ink-2">아직 체험 중이에요 ({PHASE_LABELS[p.phase]}).</p>;
  const x = r.payload;
  const m = x.metrics;
  const t0 = x.events[0]?.[0] ?? 0;
  return (
    <div className="space-y-5 text-[15px]">
      {(['self', 'ai'] as const).map((c) => (
        <div key={c} className="space-y-2">
          <div className="flex items-center justify-between">
            <CondBadge c={c} />
            <span className="text-sm text-ink-3">
              {topicById(x.writings[c].topicId).short} · {fmtSec(m[c].writeSec)} · 기억 {m[c].memory}
            </span>
          </div>
          <p className="rounded-xl bg-paper p-3 leading-relaxed">{x.writings[c].text || '(글 없음)'}</p>
          {x.writings[c].text && <RecallOverlay original={firstSentence(x.writings[c].text)} recalled={x.tests[c].quote} />}
          {c === 'ai' && m.ai.usedAi && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-ink-3">
                AI 초안 대비 바뀐 부분 ({m.ai.editRatio}%) · 요청: {m.ai.prompt}
              </div>
              <DraftDiff draft={x.writings.ai.lastDraft} final={x.writings.ai.text} />
            </div>
          )}
          {x.tests[c].clozeExpected.length > 0 && (
            <div className="text-sm text-ink-2">
              빈칸: {x.tests[c].clozeExpected.map((e, i) => `${e} → ${x.tests[c].clozeAnswers[i] || '(빈칸)'}`).join(' · ')}
            </div>
          )}
        </div>
      ))}
      <div className="space-y-1">
        <div className="text-xs font-semibold text-ink-3">설문</div>
        {SURVEY.map((q) => (
          <div key={q.id} className="text-sm">
            {q.text} <b>{x.survey[q.id] ?? '-'}</b>
          </div>
        ))}
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-ink-3">행동 기록 ({x.events.length})</summary>
        <ol className="mt-2 max-h-56 space-y-0.5 overflow-auto text-[13px] text-ink-2">
          {x.events.map(([at, what], i) => (
            <li key={i} className="tabular">
              {fmtSec((at - t0) / 1000)} · {what}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
