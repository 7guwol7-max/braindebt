// 대본형 AI 글쓰기 도우미. 실제 언어 모델 없이 미리 쓴 초안을 돌려준다.
// 반 전체가 같은 품질의 글을 받고, 지연·비용·네트워크 문제가 없다.
import { type Stance, type Topic } from './content';

const NEGATION = /안\s?(돼|된|되)|말아야|하지\s?마|아니|나쁘/;
const PRO_WORDS = ['좋', '해야', '허용', '늘려', '늘리', '늦춰', '늦추', '없애', '정해야'];
const WRITE_INTENT = /써|쓰|작성|글|만들|찬성|반대|다시|해\s?줘|부탁|입장|주장|문장/;
const REGEN = /다시|다른|또|바꿔|새로/;

export interface AiReply {
  kind: 'draft' | 'ask';
  message: string;
  stance?: Stance;
  draft?: string;
}

/** 요청 문장에서 입장을 읽는다. "찬성/반대"가 있으면 마지막에 나온 쪽, 없으면 부정 표현과 주제별 단서로 판단. */
export function detectStance(request: string, topic: Topic): Stance | null {
  const t = request.replace(/\s+/g, ' ');
  const iPro = t.lastIndexOf('찬성');
  const iCon = t.lastIndexOf('반대');
  if (iPro >= 0 || iCon >= 0) return iCon > iPro ? 'con' : 'pro';
  if (NEGATION.test(t) || topic.conHints.some((h) => t.includes(h))) return 'con';
  if (PRO_WORDS.some((w) => t.includes(w))) return 'pro';
  return null;
}

export class ScriptedAssistant {
  private cursor: Record<Stance, number>;
  private stance: Stance | null = null;
  private topic: Topic;

  constructor(topic: Topic, seed: number) {
    this.topic = topic;
    // 학생마다 다른 초안부터 시작한다. 초안이 입장마다 3개뿐이라 반 안에서 겹치는 글이 생기는데,
    // 이것이 실제 AI 글의 획일화와 닮아 발표 화면의 토론 거리가 된다.
    this.cursor = { pro: Math.abs(seed) % 3, con: Math.abs(seed >> 2) % 3 };
  }

  reply(request: string): AiReply {
    const text = request.trim();
    const isRegen = REGEN.test(text);
    const detected = detectStance(text, this.topic);
    if (!detected && !isRegen && !WRITE_INTENT.test(text)) {
      return {
        kind: 'ask',
        message: `어떤 입장으로 써 드릴까요? 예: "${this.topic.short} 주제에 찬성하는 글 3문장 써줘"`,
      };
    }
    const s: Stance = detected ?? this.stance ?? 'pro';
    if (this.stance === s) this.cursor[s] = (this.cursor[s] + 1) % 3;
    this.stance = s;
    const side = s === 'pro' ? '찬성' : '반대';
    const message = isRegen
      ? `다른 버전으로 다시 써 볼게요. (${side} 입장)`
      : `좋아요! "${this.topic.question}"에 ${side}하는 글을 3문장으로 써 볼게요.`;
    return { kind: 'draft', message, stance: s, draft: this.topic.drafts[s][this.cursor[s]] };
  }

  regenerate(): AiReply {
    return this.reply('다시 써줘');
  }
}
