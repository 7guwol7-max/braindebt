import { diffChars, matchMask } from '../lib/text';
import { cx } from './ui';

const IS_WORD = /[\p{L}\p{N}]/u;

type Seg = { cls: string; text: string };

function group(chars: string[], classOf: (ch: string, i: number) => string): Seg[] {
  const out: Seg[] = [];
  chars.forEach((ch, i) => {
    const cls = classOf(ch, i);
    const last = out[out.length - 1];
    if (last && last.cls === cls) last.text += ch;
    else out.push({ cls, text: ch });
  });
  return out;
}

/** 원문 첫 문장 위에 "내가 기억해 쓴 문장"을 겹쳐 본다. 일치한 글자는 초록, 놓친 글자는 회색. */
export function RecallOverlay({ original, recalled, big }: { original: string; recalled: string; big?: boolean }) {
  const m = matchMask(original, recalled);
  const a = group([...original], (ch, i) => (m.a[i] ? 'hit' : IS_WORD.test(ch) ? 'miss' : 'plain'));
  const b = group([...recalled], (ch, i) => (m.b[i] ? 'hit' : IS_WORD.test(ch) ? 'wrong' : 'plain'));
  const style: Record<string, string> = {
    hit: 'rounded-[3px] bg-good-soft text-ink',
    miss: 'text-ink-3',
    wrong: 'text-ink-3 line-through decoration-bad/50',
    plain: '',
  };
  return (
    <div className={cx('space-y-3', big ? 'text-2xl leading-relaxed sm:text-3xl' : 'text-[15px] leading-relaxed')}>
      <div>
        <div className={cx('mb-1 font-semibold text-ink-3', big ? 'text-base' : 'text-xs')}>제출한 글의 첫 문장</div>
        <p>
          {a.map((s, i) => (
            <span key={i} className={style[s.cls]}>
              {s.text}
            </span>
          ))}
        </p>
      </div>
      <div>
        <div className={cx('mb-1 font-semibold text-ink-3', big ? 'text-base' : 'text-xs')}>기억해서 쓴 문장</div>
        <p>
          {recalled.trim() ? (
            b.map((s, i) => (
              <span key={i} className={style[s.cls]}>
                {s.text}
              </span>
            ))
          ) : (
            <span className="text-ink-3">(기억나지 않아 비워 둠)</span>
          )}
        </p>
      </div>
    </div>
  );
}

/** AI 초안 → 최종 제출 글. 내가 넣은 글자는 노란 바탕, 지운 글자는 취소선. */
export function DraftDiff({ draft, final }: { draft: string; final: string }) {
  const segs = diffChars(draft, final);
  const changed = segs.some((s) => s.type !== 'same');
  return (
    <div className="text-[15px] leading-relaxed">
      <p>
        {segs.map((s, i) => (
          <span
            key={i}
            className={cx(
              s.type === 'add' && 'rounded-[3px] bg-hl',
              s.type === 'del' && 'text-bad/70 line-through',
            )}
          >
            {s.text}
          </span>
        ))}
      </p>
      {!changed && <p className="mt-2 text-sm text-ink-3">초안을 한 글자도 바꾸지 않고 제출했어요.</p>}
    </div>
  );
}
