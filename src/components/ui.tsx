import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { fmtClock } from '../lib/scoring';
import type { Condition } from '../lib/types';

export function cx(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ');
}

export function Page({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className="min-h-dvh bg-paper">
      <div className={cx('mx-auto px-4 pb-16 pt-5 sm:pt-8', wide ? 'max-w-6xl' : 'max-w-xl', className)}>{children}</div>
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'self' | 'ai';

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; block?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' && 'h-9 px-3 text-sm',
        size === 'md' && 'h-12 px-5 text-[15px]',
        size === 'lg' && 'h-14 px-6 text-base',
        block && 'w-full',
        variant === 'primary' && 'bg-ink text-white hover:bg-black',
        variant === 'secondary' && 'border border-line-2 bg-card text-ink hover:bg-paper',
        variant === 'ghost' && 'text-ink-2 hover:bg-black/5',
        variant === 'danger' && 'bg-bad text-white hover:brightness-95',
        variant === 'self' && 'bg-self text-white hover:brightness-95',
        variant === 'ai' && 'bg-ai text-white hover:brightness-95',
        className,
      )}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  // Tailwind는 같은 속성의 클래스가 겹치면 class 순서가 아니라 CSS 순서로 이긴다. 그래서 기본값은 덮어쓸 값이 없을 때만 넣는다.
  const hasBg = /(^|\s)bg-/.test(className);
  const hasPad = /(^|\s)p-\d/.test(className);
  return <div className={cx('rounded-2xl border border-line', !hasBg && 'bg-card', !hasPad && 'p-5', className)}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="text-[13px] font-semibold tracking-wide text-ink-3">{children}</div>;
}

export const COND_LABEL: Record<Condition, string> = { self: '직접 쓴 글', ai: 'AI와 쓴 글' };
export const COND_ICON: Record<Condition, string> = { self: '✍️', ai: '🤖' };

export function Swatch({ c, className }: { c: Condition; className?: string }) {
  return <span aria-hidden className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', c === 'self' ? 'bg-self' : 'bg-ai', className)} />;
}

export function CondBadge({ c, short }: { c: Condition; short?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold text-ink',
        c === 'self' ? 'bg-self-soft' : 'bg-ai-soft',
      )}
    >
      <Swatch c={c} />
      {short ? (c === 'self' ? '직접' : 'AI') : COND_LABEL[c]}
    </span>
  );
}

export function TimerBar({ remainingMs, totalMs, paused }: { remainingMs: number; totalMs: number; paused?: boolean }) {
  const f = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const low = remainingMs < 15000;
  return (
    <div className="flex items-center gap-3" role="timer" aria-label={`남은 시간 ${fmtClock(remainingMs)}`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className={cx('h-full rounded-full transition-[width] duration-300 ease-linear', low ? 'bg-bad' : 'bg-ink')}
          style={{ width: `${f * 100}%` }}
        />
      </div>
      <span className={cx('tabular w-12 text-right text-sm font-semibold', low ? 'text-bad' : 'text-ink-2')}>
        {paused ? '⏸' : fmtClock(remainingMs)}
      </span>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-ink-3">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-2 border-t-ink" />
      {label}
    </div>
  );
}

export function Modal({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: string }) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        className="pop max-h-[90dvh] w-full max-w-lg overflow-auto rounded-t-3xl bg-card p-6 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="mb-4 text-lg font-bold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

const ToastCtx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, msg }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} role="status" className="pop rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg">
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function useNow(intervalMs = 250, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, active]);
  return now;
}

export function DemoBanner() {
  return (
    <div className="no-print border-b border-warn/20 bg-warn-soft px-4 py-2 text-center text-[13px] text-ink-2">
      데모 모드: 이 브라우저 안에서만 수업이 공유돼요. 탭을 여러 개 열어 교수자·학생 화면을 시연할 수 있어요.
    </div>
  );
}
