// 두 계열(직접 = 파랑, AI = 주황)만 쓰는 작은 차트들. 색만으로 구분하지 않도록 항상 범례와 값 라벨을 함께 둔다.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx, Swatch } from './ui';

const SELF = 'var(--color-self)';
const AI = 'var(--color-ai)';

export function Legend({ className }: { className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-4 text-[13px] text-ink-2', className)}>
      <span className="inline-flex items-center gap-1.5">
        <Swatch c="self" /> 직접 쓴 글
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Swatch c="ai" /> AI와 쓴 글
      </span>
    </div>
  );
}

function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setM(true));
    return () => cancelAnimationFrame(t);
  }, []);
  return m;
}

export interface MetricRow {
  label: string;
  self: number;
  ai: number;
  max: number;
  fmt?: (v: number) => string;
}

/** 지표마다 두 개의 가로 막대. 값은 막대 끝에. */
export function MetricBars({ rows, big }: { rows: MetricRow[]; big?: boolean }) {
  const mounted = useMounted();
  return (
    <div className={cx('space-y-5', big && 'space-y-7')}>
      {rows.map((r) => (
        <div key={r.label}>
          <div className={cx('mb-2 font-semibold text-ink', big ? 'text-xl' : 'text-sm')}>{r.label}</div>
          {(['self', 'ai'] as const).map((c) => {
            const v = r[c];
            const f = r.max > 0 ? Math.max(0, Math.min(1, v / r.max)) : 0;
            return (
              <div key={c} className="mb-1.5 flex items-center gap-2" title={`${c === 'self' ? '직접 쓴 글' : 'AI와 쓴 글'} ${r.fmt ? r.fmt(v) : v}`}>
                <div className={cx('relative flex-1', big ? 'h-6' : 'h-4')}>
                  <div
                    className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-1000 ease-out"
                    style={{ width: mounted ? `max(${f * 100}%, 3px)` : '0%', background: c === 'self' ? SELF : AI }}
                  />
                </div>
                <span className={cx('tabular w-16 text-right font-semibold text-ink', big ? 'text-xl' : 'text-sm')}>
                  {r.fmt ? r.fmt(v) : v}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (e: { clientX: number; clientY: number }, content: ReactNode) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, content });
  };
  const showAt = (el: Element, content: ReactNode) => {
    const r = ref.current?.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (!r) return;
    setTip({ x: b.left + b.width / 2 - r.left, y: b.top - r.top, content });
  };
  const node = tip && (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] shadow-md"
      style={{ left: tip.x, top: tip.y - 10 }}
    >
      {tip.content}
    </div>
  );
  return { ref, show, showAt, hide: () => setTip(null), node };
}

function TipRow({ c, label, value }: { c: 'self' | 'ai'; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="h-0.5 w-3 rounded" style={{ background: c === 'self' ? SELF : AI }} />
      <span className="font-semibold text-ink">{value}</span>
      <span className="text-ink-3">{label}</span>
    </div>
  );
}

/** 첫 문장 일치율 분포: 구간마다 직접/AI 두 막대. markers로 "나"의 위치를 표시. */
export function Histogram({
  bins,
  self,
  ai,
  markers,
  height = 220,
  unit = '명',
}: {
  bins: string[];
  self: number[];
  ai: number[];
  markers?: { self?: number; ai?: number };
  height?: number;
  unit?: string;
}) {
  const t = useTip();
  const W = 560;
  const H = height;
  const pad = { l: 34, r: 8, t: 12, b: markers ? 52 : 34 };
  const max = Math.max(1, ...self, ...ai);
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * Math.ceil(max / step);
  const ih = H - pad.t - pad.b;
  const iw = W - pad.l - pad.r;
  const band = iw / bins.length;
  const bw = Math.min(24, (band - 14) / 2);
  const y = (v: number) => pad.t + ih - (v / top) * ih;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const bar = (x: number, v: number) => {
    const h = (v / top) * ih;
    const r = Math.min(4, h);
    const y0 = pad.t + ih;
    return `M${x},${y0} V${y0 - h + r} Q${x},${y0 - h} ${x + r},${y0 - h} H${x + bw - r} Q${x + bw},${y0 - h} ${x + bw},${y0 - h + r} V${y0} Z`;
  };
  const markerBin = (v: number) => Math.min(bins.length - 1, Math.floor(Math.max(0, v) / (100 / bins.length)));
  return (
    <div ref={t.ref} className="relative">
      <Legend className="mb-2" />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="첫 문장 일치율 분포">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--color-ink-3)">
              {v}
            </text>
          </g>
        ))}
        {bins.map((b, i) => {
          const cx0 = pad.l + band * i + band / 2;
          const xs = cx0 - bw - 1;
          const xa = cx0 + 1;
          return (
            <g key={b}>
              {self[i] > 0 && <path d={bar(xs, self[i])} fill={SELF} />}
              {ai[i] > 0 && <path d={bar(xa, ai[i])} fill={AI} />}
              <rect
                x={pad.l + band * i}
                y={pad.t}
                width={band}
                height={ih}
                fill="transparent"
                tabIndex={0}
                onPointerMove={(e) =>
                  t.show(e, (
                    <div>
                      <div className="mb-1 text-ink-3">일치율 {b}%</div>
                      <TipRow c="self" label="직접" value={`${self[i]}${unit}`} />
                      <TipRow c="ai" label="AI" value={`${ai[i]}${unit}`} />
                    </div>
                  ))
                }
                onFocus={(e) =>
                  t.showAt(e.currentTarget, (
                    <div>
                      <div className="mb-1 text-ink-3">일치율 {b}%</div>
                      <TipRow c="self" label="직접" value={`${self[i]}${unit}`} />
                      <TipRow c="ai" label="AI" value={`${ai[i]}${unit}`} />
                    </div>
                  ))
                }
                onPointerLeave={t.hide}
                onBlur={t.hide}
              />
              <text x={cx0} y={pad.t + ih + 18} textAnchor="middle" fontSize={12} fill="var(--color-ink-2)">
                {b}%
              </text>
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--color-line-2)" strokeWidth={1} />
        {markers &&
          (['self', 'ai'] as const).map((c) => {
            const v = markers[c];
            if (v === undefined) return null;
            const i = markerBin(v);
            const x = pad.l + band * i + band / 2 + (c === 'self' ? -bw / 2 - 1 : bw / 2 + 1);
            const yy = pad.t + ih + 26;
            return (
              <g key={c}>
                <path d={`M${x},${yy} l-6,10 h12 z`} fill={c === 'self' ? SELF : AI} stroke="var(--color-card)" strokeWidth={2} />
                <text x={x} y={yy + 22} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--color-ink)">
                  나
                </text>
              </g>
            );
          })}
      </svg>
      {t.node}
    </div>
  );
}

/** 초안 수정 비율(x) ↔ AI 글 기억 점수(y) */
export function Scatter({ points, height = 300 }: { points: { x: number; y: number }[]; height?: number }) {
  const t = useTip();
  const W = 560;
  const H = height;
  const pad = { l: 40, r: 14, t: 14, b: 44 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const sx = (v: number) => pad.l + (Math.min(100, v) / 100) * iw;
  const sy = (v: number) => pad.t + ih - (Math.min(100, v) / 100) * ih;
  const ticks = [0, 25, 50, 75, 100];
  return (
    <div ref={t.ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="초안 수정 비율과 AI 글 기억 점수">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={pad.l - 8} y={sy(v) + 4} textAnchor="end" fontSize={12} fill="var(--color-ink-3)">
              {v}
            </text>
            <text x={sx(v)} y={pad.t + ih + 18} textAnchor="middle" fontSize={12} fill="var(--color-ink-3)">
              {v}%
            </text>
          </g>
        ))}
        <text x={pad.l + iw / 2} y={H - 4} textAnchor="middle" fontSize={12} fill="var(--color-ink-2)">
          AI 초안을 고친 비율
        </text>
        <text x={12} y={pad.t + ih / 2} textAnchor="middle" fontSize={12} fill="var(--color-ink-2)" transform={`rotate(-90 12 ${pad.t + ih / 2})`}>
          AI 글 기억 점수
        </text>
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={6} fill={AI} stroke="var(--color-card)" strokeWidth={2} opacity={0.9} />
            <circle
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={14}
              fill="transparent"
              tabIndex={0}
              onPointerMove={(e) => t.show(e, <div className="whitespace-nowrap"><b>{p.x}%</b> 고침 · 기억 <b>{p.y}점</b></div>)}
              onFocus={(e) => t.showAt(e.currentTarget, <div className="whitespace-nowrap"><b>{p.x}%</b> 고침 · 기억 <b>{p.y}점</b></div>)}
              onPointerLeave={t.hide}
              onBlur={t.hide}
            />
          </g>
        ))}
      </svg>
      {points.length === 0 && <p className="text-center text-sm text-ink-3">아직 점이 없어요.</p>}
      {t.node}
    </div>
  );
}

export function CountUp({ value, suffix = '', duration = 1200 }: { value: number; suffix?: string; duration?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const f = Math.min(1, (t - t0) / duration);
      setV(Math.round(value * (1 - Math.pow(1 - f, 3))));
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return (
    <span className="tabular">
      {v}
      {suffix}
    </span>
  );
}
