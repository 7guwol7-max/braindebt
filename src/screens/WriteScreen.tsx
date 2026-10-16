import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type ReactNode } from 'react';
import { Button, Card, TimerBar, cx, useToast } from '../components/ui';
import { ScriptedAssistant } from '../lib/ai';
import { topicById } from '../lib/content';
import { levelSpec, meetsMinimum } from '../lib/levels';
import { fmtSec } from '../lib/scoring';
import { SPEED } from '../lib/storage';
import { countSentences, normalize } from '../lib/text';
import {
  conditionOf, extendWriting, finishWriting, log, remaining, topicOf, type ChatMsg, type FlowState,
} from '../flow/state';
import type { Update } from '../flow/useFlow';

const REGEN_PROMPT = '다시 써줘';



export function WriteScreen({ state, update, now }: { state: FlowState; update: Update; now: number }) {
  const toast = useToast();
  const c = conditionOf(state);
  const topic = topicById(topicOf(state, c));
  const phase = state.phase;
  const d = state.draft;
  const rem = remaining(state, now) ?? 0;
  const total = (state.deadline ?? 0) - state.stepStartedAt;
  const paused = !!state.pausedAt;
  const isAi = c === 'ai';
  const step = phase === 'write1' ? 1 : 2;
  const spec = levelSpec(state.level);

  // 대본형 도우미: 새로고침 뒤에도 같은 순서로 초안을 내도록 지금까지의 요청을 다시 재생한다.
  const assistant = useMemo(() => {
    const a = new ScriptedAssistant(topic, state.seed + step, state.level);
    for (const p of d.prompts) a.reply(p);
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id]);

  const [thinking, setThinking] = useState(false);
  const [shown, setShown] = useState<number | null>(null); // 타이핑 애니메이션 중 보여 줄 글자 수
  const [input, setInput] = useState('');
  const chatEnd = useRef<HTMLDivElement>(null);
  const streaming = shown !== null;

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [d.chat.length, thinking]);

  useEffect(() => {
    if (shown === null) return;
    if (shown >= d.text.length) {
      setShown(null);
      return;
    }
    const t = setTimeout(() => setShown((n) => (n === null ? null : n + 3)), Math.max(4, 28 / SPEED));
    return () => clearTimeout(t);
  }, [shown, d.text.length]);

  const submit = (auto: boolean) => {
    const dl = state.deadline;
    if (isAi) {
      const sec = ((Date.now() - state.phaseStartedAt) * SPEED) / 1000;
      const selfRec = state.writings.self;
      const faster = selfRec ? selfRec.durationMs / 1000 - sec : 0;
      toast(
        `⚡ ${fmtSec(sec)} 만에 완료! 직접 친 글자 ${d.typed}자.` + (faster >= 5 ? ` 혼자 쓸 때보다 ${fmtSec(faster)} 빨랐어요.` : ''),
      );
    }
    update((s) => (s.phase === phase && s.deadline === dl ? finishWriting(s, Date.now(), auto) : s));
  };

  // 시간이 다 되면: 혼자 쓰기에서 거의 못 썼으면 30초 한 번 연장, 아니면 쓴 만큼 제출.
  const timeUp = rem <= 0 && !paused && state.deadline !== null;
  useEffect(() => {
    if (!timeUp) return;
    const dl = state.deadline;
    if (!isAi && normalize(d.text).length < Math.round(spec.minChars / 2) && !d.extended) {
      toast('30초 더 드릴게요. 한두 문장이라도 써 보세요.');
      update((s) => (s.phase === phase && s.deadline === dl ? extendWriting(s, Date.now()) : s));
    } else {
      submit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  const onText = (text: string) => {
    if (streaming) return;
    update((s) => {
      const grow = Math.max(0, [...text].length - [...s.draft.text].length);
      return { ...s, draft: { ...s.draft, text, typed: s.draft.typed + grow, lastInputAt: Date.now() } };
    });
  };

  const onPaste = (e: ClipboardEvent) => {
    if (isAi) return;
    e.preventDefault();
    toast('이번 글은 직접 써 보세요. 붙여넣기는 막혀 있어요.');
    update((s) => log({ ...s, draft: { ...s.draft, pasteBlocked: s.draft.pasteBlocked + 1 } }, Date.now(), 'paste_blocked'));
  };

  const ask = (prompt: string, chip: boolean) => {
    const text = prompt.trim();
    if (!text || thinking || streaming) return;
    setInput('');
    const reply = assistant.reply(text);
    const isRegen = text === REGEN_PROMPT;
    update((s) =>
      log(
        {
          ...s,
          draft: {
            ...s.draft,
            prompts: [...s.draft.prompts, text],
            chipUsed: s.draft.chipUsed || chip,
            chat: [...s.draft.chat, { role: 'me', text } as ChatMsg],
            lastInputAt: Date.now(),
          },
        },
        Date.now(),
        `ai_request:${text}`,
      ),
    );
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      update((s) => {
        const chat: ChatMsg[] = [...s.draft.chat, { role: 'ai', text: reply.message }];
        if (reply.kind !== 'draft' || !reply.draft) return { ...s, draft: { ...s.draft, chat } };
        const at = Date.now();
        return log(
          {
            ...s,
            draft: {
              ...s.draft,
              chat: [...chat, { role: 'ai', text: '아래 입력창에 넣어 두었어요. 그대로 내도 되고, 고쳐도 돼요.' }],
              text: reply.draft,
              drafts: [...s.draft.drafts, reply.draft],
              lastDraft: reply.draft,
              regenCount: s.draft.regenCount + (isRegen || s.draft.drafts.length > 0 ? 1 : 0),
              firstDraftAt: s.draft.firstDraftAt ?? at,
            },
          },
          at,
          `ai_draft:${reply.stance}`,
        );
      });
      if (reply.kind === 'draft') setShown(0);
    }, Math.max(150, 1100 / SPEED));
  };

  const onSend = (e: FormEvent) => {
    e.preventDefault();
    ask(input, false);
  };

  const text = streaming ? d.text.slice(0, shown ?? 0) : d.text;
  const chars = [...d.text.trim()].length;
  const sentences = countSentences(d.text);
  const ok = meetsMinimum(d.text, state.level) && !streaming;

  return (
    <div className="rise space-y-4">
      <div className="sticky top-0 z-10 -mx-4 bg-paper/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <span
            className={cx(
              'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold text-ink',
              isAi ? 'bg-ai-soft' : 'bg-self-soft',
            )}
          >
            <span aria-hidden className={cx('h-2.5 w-2.5 rounded-full', isAi ? 'bg-ai' : 'bg-self')} />
            {isAi ? '🤖 AI 도우미와 쓰기' : '✍️ 혼자 쓰기'}
          </span>
          <span className="text-sm font-semibold text-ink-3">글 {step} / 2</span>
        </div>
        <TimerBar remainingMs={rem} totalMs={total} paused={paused} />
      </div>

      <Card>
        <div className="text-[13px] font-semibold text-ink-3">주제</div>
        <h2 className="mt-1 text-xl font-bold leading-snug">{topic.question}</h2>
        <p className="mt-2 text-sm text-ink-2">
          찬성이든 반대든 좋아요. <b className="text-ink">{spec.format}</b>으로 써 주세요.
        </p>
      </Card>

      {isAi && (
        <Card className="space-y-3 p-4">
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1" aria-live="polite">
            <Bubble role="ai" text="안녕하세요! 글쓰기 도우미예요. 어떤 글을 써 드릴까요?" />
            {d.chat.map((m, i) => (
              <Bubble key={i} role={m.role} text={m.text} />
            ))}
            {thinking && (
              <div className="flex items-start gap-2">
                <Avatar />
                <div className="typing rounded-2xl rounded-tl-sm bg-ai-soft px-4 py-3 text-lg leading-none text-ink-2">
                  <span>●</span>
                  <span>●</span>
                  <span>●</span>
                </div>
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip onClick={() => ask(`찬성하는 글 ${spec.sentences} 써줘`, true)} disabled={thinking || streaming}>
              찬성하는 글 써줘
            </Chip>
            <Chip onClick={() => ask(`반대하는 글 ${spec.sentences} 써줘`, true)} disabled={thinking || streaming}>
              반대하는 글 써줘
            </Chip>
            {d.drafts.length > 0 && (
              <Chip onClick={() => ask(REGEN_PROMPT, true)} disabled={thinking || streaming}>
                🔄 다시 써줘
              </Chip>
            )}
          </div>
          <form onSubmit={onSend} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`예: ${topic.short} 주제로 찬성하는 글 써줘`}
              className="h-11 min-w-0 flex-1 rounded-xl border border-line-2 bg-paper px-3 text-[15px] outline-none focus:border-ink"
              aria-label="AI에게 요청하기"
            />
            <Button size="sm" className="h-11" type="submit" disabled={!input.trim() || thinking || streaming}>
              보내기
            </Button>
          </form>
        </Card>
      )}

      <div>
        <label className="mb-2 flex items-end justify-between" htmlFor="essay">
          <span className="text-[15px] font-bold">제출할 글</span>
          <span className={cx('tabular text-sm', ok ? 'text-good' : 'text-ink-3')}>
            {chars}/{spec.minChars}자 · {sentences}/{spec.minSentences}문장
          </span>
        </label>
        <textarea
          id="essay"
          value={text}
          readOnly={streaming}
          onChange={(e) => onText(e.target.value)}
          onPaste={onPaste}
          onDrop={(e) => !isAi && e.preventDefault()}
          rows={spec.editorRows}
          placeholder={isAi ? 'AI에게 부탁하면 여기에 글이 들어와요. 직접 써도 돼요.' : '여기에 직접 써 보세요.'}
          className={cx(
            'w-full resize-none rounded-2xl border bg-card p-4 text-[16px] leading-relaxed outline-none transition focus:border-ink',
            streaming ? 'caret border-ai' : 'border-line-2',
          )}
          autoComplete="off"
          spellCheck={false}
        />
        {!isAi && (
          <details className="mt-2 text-sm text-ink-2">
            <summary className="cursor-pointer select-none text-ink-3">문장 시작 도움말</summary>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {spec.starters.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <Button size="lg" block disabled={!ok} onClick={() => submit(false)}>
        {ok ? '제출하기' : `${spec.minSentences}문장, ${spec.minChars}자 이상 쓰면 제출할 수 있어요`}
      </Button>
    </div>
  );
}

function Avatar() {
  return (
    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ai-soft text-base">
      🤖
    </span>
  );
}

function Bubble({ role, text }: { role: 'ai' | 'me'; text: string }) {
  if (role === 'me') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-ink px-3.5 py-2.5 text-[15px] text-white">{text}</div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <Avatar />
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-ai-soft px-3.5 py-2.5 text-[15px] text-ink">{text}</div>
    </div>
  );
}

function Chip({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-line-2 bg-card px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-paper active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
