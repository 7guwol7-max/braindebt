import { useRef, type ReactNode } from 'react';
import { Button, Card, CondBadge, Eyebrow, cx, useToast } from '../components/ui';
import { DraftDiff, RecallOverlay } from '../components/textviz';
import { topicById, MIT_FACT } from '../lib/content';
import { DEBT_THRESHOLD, PREDICTION_EMOJI, fmtSec } from '../lib/scoring';
import { firstSentence } from '../lib/text';
import type { Metrics, ResultPayload } from '../lib/types';

export function debtHeadline(m: Metrics): string {
  const saved = Math.max(0, m.self.writeSec - m.ai.writeSec);
  if (!m.comparable) return '비교할 글이 부족해서 청구서를 만들 수 없어요.';
  if (m.noDebt) return '🎉 부채 0원! AI와 쓴 글도 내 글처럼 기억했어요.';
  const time = saved > 0 ? `${fmtSec(saved)} 아끼고` : '시간은 거의 아끼지 못했는데';
  if (m.debt >= 40) return `${time}, 글 한 편을 기억에서 잃었어요.`;
  return `${time}, 기억 ${m.debt}점을 이자로 냈어요.`;
}

function Row({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-ink-2">{label}</span>
      <span className="text-right">
        <span className="tabular font-semibold">{value}</span>
        {sub && <span className="tabular ml-1.5 text-[13px] text-ink-3">{sub}</span>}
      </span>
    </div>
  );
}

const signed = (v: number, unit = '') => `${v > 0 ? '+' : ''}${v}${unit}`;

export function Receipt({ result, nickname }: { result: ResultPayload; nickname: string }) {
  const m = result.metrics;
  const saved = Math.max(0, m.self.writeSec - m.ai.writeSec);
  const typedSaved = Math.max(0, m.self.typed - m.ai.typed);
  const date = new Date(result.finishedAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  return (
    <div className="mx-auto w-full max-w-[380px] bg-card px-6 py-6 text-[15px] shadow-[0_1px_0_var(--color-line),0_8px_24px_rgba(0,0,0,0.06)] [mask:radial-gradient(8px_at_50%_0,#0000_98%,#000)_50%_0/18px_100%_repeat-x]">
      <div className="text-center">
        <div className="text-2xl">🧾</div>
        <div className="mt-1 text-xl font-extrabold tracking-tight">인지 부채 청구서</div>
        <div className="mt-1 text-[13px] text-ink-3">
          고객 {nickname || '익명'} · {date}
        </div>
      </div>
      <hr className="my-4 border-dashed border-line-2" />
      <div className="text-[13px] font-bold text-ink-3">빌린 것</div>
      <Row label="글쓰기 시간 절약" value={fmtSec(saved)} />
      <Row label="직접 친 글자 절약" value={`${typedSaved}자`} />
      <hr className="my-4 border-dashed border-line-2" />
      <div className="text-[13px] font-bold text-ink-3">이자 (직접 쓴 글 → AI와 쓴 글)</div>
      <Row label="첫 문장 기억" value={`${m.self.quoteSim}% → ${m.ai.quoteSim}%`} sub={signed(m.ai.quoteSim - m.self.quoteSim, '%p')} />
      <Row
        label="빈칸 채우기"
        value={`${m.self.clozeCorrect} → ${m.ai.clozeCorrect}개`}
        sub={signed(m.ai.clozeCorrect - m.self.clozeCorrect)}
      />
      <Row
        label="'내 글' 느낌"
        value={`${m.self.ownership ?? '-'} → ${m.ai.ownership ?? '-'}`}
        sub={m.self.ownership !== null && m.ai.ownership !== null ? signed(m.ai.ownership - m.self.ownership) : undefined}
      />
      <Row
        label="예상 vs 실제 (AI 글)"
        value={`${m.ai.prediction ? PREDICTION_EMOJI[m.ai.prediction] : '-'} → ${m.ai.memory}점`}
      />
      <hr className="my-4 border-dashed border-line-2" />
      <div className="flex items-baseline justify-between">
        <span className="font-bold">기억 점수</span>
        <span className="tabular text-lg font-extrabold">
          {m.self.memory} → {m.ai.memory}
        </span>
      </div>
      <p className="mt-3 rounded-xl bg-paper px-3 py-2.5 text-center text-[15px] font-bold leading-snug">{debtHeadline(m)}</p>
    </div>
  );
}

export function BillScreen({ result, nickname, children }: { result: ResultPayload; nickname: string; children?: ReactNode }) {
  const toast = useToast();
  const receiptRef = useRef<HTMLDivElement>(null);
  const m = result.metrics;
  const w = result.writings;
  const t = result.tests;

  const saveImage = async () => {
    if (!receiptRef.current) return;
    try {
      const { toPng } = await import('html-to-image');
      const url = await toPng(receiptRef.current, { pixelRatio: 2, backgroundColor: '#f7f7f5', skipFonts: false });
      const a = document.createElement('a');
      a.href = url;
      a.download = '인지부채-청구서.png';
      a.click();
    } catch {
      toast('이미지를 만들지 못했어요. 화면을 캡처해 주세요.');
    }
  };

  const tips: string[] = [];
  if (m.noDebt) {
    if (!m.ai.usedAi) tips.push('AI 도우미를 쓰지 않고 직접 썼어요. 그래서 두 글 모두 기억에 남았어요.');
    if (m.ai.editRatio !== null && m.ai.editRatio >= 15) tips.push(`AI 초안을 ${m.ai.editRatio}% 고쳤어요. 고친 만큼 내 글이 돼요.`);
    if (m.ai.readSec !== null && m.ai.readSec >= 20) tips.push(`초안을 ${fmtSec(m.ai.readSec)} 동안 읽고 다듬었어요.`);
    if (tips.length === 0) tips.push('AI 글도 꼼꼼히 읽었네요. 그 습관이 기억을 지켜 줘요.');
  }

  const rows: [string, ReactNode, ReactNode][] = [
    ['쓰기 시간', fmtSec(m.self.writeSec), fmtSec(m.ai.writeSec)],
    ['직접 친 글자', `${m.self.typed}자`, `${m.ai.typed}자`],
    ['시험 전 예상', m.self.prediction ? PREDICTION_EMOJI[m.self.prediction] : '-', m.ai.prediction ? PREDICTION_EMOJI[m.ai.prediction] : '-'],
    ['첫 문장 일치율', `${m.self.quoteSim}%`, `${m.ai.quoteSim}%`],
    ['빈칸 채우기', `${m.self.clozeCorrect}/${m.self.clozeTotal}`, `${m.ai.clozeCorrect}/${m.ai.clozeTotal}`],
    ["'내 글' 느낌", m.self.ownership ?? '-', m.ai.ownership ?? '-'],
    ['기억 점수', <b key="s">{m.self.memory}</b>, <b key="a">{m.ai.memory}</b>],
  ];

  return (
    <div className="space-y-6">
      <div className="rise">
        <Eyebrow>결과가 나왔어요</Eyebrow>
        <h1 className="mt-1 text-[26px] font-bold leading-tight">
          {m.comparable && !m.noDebt ? 'AI와 쓴 글은 기억에 덜 남았어요' : m.comparable ? '두 글을 모두 잘 기억했어요' : '이번 결과는 비교가 어려워요'}
        </h1>
      </div>

      <div ref={receiptRef} className="rise px-1 py-3" style={{ animationDelay: '0.1s' }}>
        <Receipt result={result} nickname={nickname} />
      </div>

      {m.noDebt && (
        <Card className="space-y-2 border-good/30 bg-good-soft">
          <div className="font-bold">부채가 없는 비결</div>
          {tips.map((x) => (
            <p key={x} className="text-[15px] text-ink-2">
              {x}
            </p>
          ))}
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-line text-left text-[13px] text-ink-3">
              <th className="px-4 py-3 font-semibold">나란히 보기</th>
              <th className="px-3 py-3 font-semibold">
                <CondBadge c="self" short />
              </th>
              <th className="px-3 py-3 font-semibold">
                <CondBadge c="ai" short />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, a, b]) => (
              <tr key={label} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 text-ink-2">{label}</td>
                <td className="tabular px-3 py-2.5">{a}</td>
                <td className="tabular px-3 py-2.5">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">첫 문장, 얼마나 기억했을까?</h2>
        {(['self', 'ai'] as const).map((c) =>
          w[c].text ? (
            <Card key={c} className="space-y-3">
              <div className="flex items-center justify-between">
                <CondBadge c={c} />
                <span className="text-sm text-ink-3">
                  {topicById(w[c].topicId).short} 글 · 일치율 <b className="tabular text-ink">{m[c].quoteSim}%</b>
                </span>
              </div>
              <RecallOverlay original={firstSentence(w[c].text)} recalled={t[c].quote} />
            </Card>
          ) : null,
        )}
        <p className="text-[13px] text-ink-3">초록색은 기억한 글자, 회색은 놓친 글자예요.</p>
      </section>

      {m.ai.usedAi && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">AI 초안에서 내가 바꾼 부분</h2>
          <Card className="space-y-3">
            <div className="flex items-center justify-between text-sm text-ink-3">
              <span>
                바꾼 비율 <b className="tabular text-ink">{m.ai.editRatio ?? 0}%</b>
              </span>
              <span>
                다시 쓰기 <b className="tabular text-ink">{m.ai.regenCount}</b>번
              </span>
            </div>
            <DraftDiff draft={w.ai.lastDraft} final={w.ai.text} />
          </Card>
          <p className="text-[13px] text-ink-3">노란 바탕은 내가 넣은 글자, 취소선은 지운 글자예요.</p>
        </section>
      )}

      <Card className="space-y-3 bg-ink text-white">
        <div className="text-[13px] font-semibold text-white/60">이 실험의 진짜 이름</div>
        <h2 className="text-2xl font-bold">인지 부채 (Cognitive Debt)</h2>
        <p className="text-[15px] leading-relaxed text-white/85">
          AI에게 생각을 맡기면 지금은 편하지만, 그만큼 내 머리에 남는 것이 줄어들어요. 아낀 시간은 <b>대출</b>이고, 나중에
          기억·이해·주인의식으로 <b>이자</b>를 내게 돼요.
        </p>
        <p className="text-[15px] leading-relaxed text-white/85">{MIT_FACT}</p>
        {m.comparable && (
          <p className={cx('rounded-xl px-3 py-2.5 text-[15px] font-semibold', m.noDebt ? 'bg-white/10' : 'bg-ai/25')}>
            {m.noDebt
              ? '오늘 나는 AI와 쓴 글도 잘 기억했어요. 어떻게 썼는지가 차이를 만들어요.'
              : `오늘 내 결과도 같은 패턴이에요. 기억 점수가 ${m.debt}점 차이 났어요.`}
          </p>
        )}
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">AI와 쓰더라도 "내 글"로 남기는 법</h2>
        {[
          ['1', '먼저 내 생각을 3줄 쓰고, 그다음 AI에게 다듬어 달라고 하기'],
          ['2', 'AI 초안을 받으면 최소 한 문장은 내 말로 다시 쓰기'],
          ['3', '제출 전에 글을 가리고 첫 문장을 말해 보기'],
        ].map(([n, text]) => (
          <div key={n} className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">{n}</span>
            <span className="pt-0.5 text-[15px] font-medium">{text}</span>
          </div>
        ))}
      </section>

      <div className="space-y-2">
        <Button variant="secondary" block onClick={saveImage}>
          청구서 이미지로 저장
        </Button>
        {children}
      </div>

      <p className="text-center text-[13px] leading-relaxed text-ink-3">
        결과는 사람마다, 날마다 달라요. 기억 점수가 {DEBT_THRESHOLD}점 넘게 차이 나면 부채로 봤어요.
        <br />
        핵심은 "내가 AI를 어떻게 썼는가"를 돌아보는 거예요.
      </p>
    </div>
  );
}
