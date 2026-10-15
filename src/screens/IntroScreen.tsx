import { Button, Card, Eyebrow } from '../components/ui';
import { fmtSec } from '../lib/scoring';

export function IntroScreen({
  nickname,
  writeSeconds,
  waiting,
  onStart,
}: {
  nickname: string;
  writeSeconds: number;
  waiting?: boolean;
  onStart: () => void;
}) {
  const steps = [
    ['✍️', '짧은 글 2편 쓰기', `한 편당 ${fmtSec(writeSeconds)}`],
    ['☕', '잠깐 쉬기', '1분'],
    ['💬', '몇 가지 질문에 답하기', '약 3분'],
    ['🧾', '결과 보기', ''],
  ];
  return (
    <div className="rise space-y-5">
      <div>
        <Eyebrow>{nickname ? `${nickname} 님, 반가워요` : '반가워요'}</Eyebrow>
        <h1 className="mt-1 text-[28px] font-bold leading-tight">10분 글쓰기 실험</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          두 가지 주제로 짧은 글(3문장)을 써요. 한 번은 <b className="text-ink">혼자</b>, 한 번은{' '}
          <b className="text-ink">AI 도우미와 함께</b> 써요.
        </p>
      </div>
      <Card className="space-y-3">
        {steps.map(([icon, label, time]) => (
          <div key={label} className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-paper text-lg">{icon}</span>
            <span className="flex-1 font-medium">{label}</span>
            <span className="text-sm text-ink-3">{time}</span>
          </div>
        ))}
      </Card>
      <p className="text-sm leading-relaxed text-ink-3">정답은 없어요. 평소 숙제할 때처럼 편하게 해 주세요.</p>
      {waiting ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-dashed border-line-2 bg-card px-4 py-5 text-[15px] font-medium text-ink-2">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-good" />
          </span>
          선생님이 시작하면 바로 시작돼요
        </div>
      ) : (
        <Button size="lg" block onClick={onStart}>
          시작하기
        </Button>
      )}
    </div>
  );
}
