import type { Stance, Topic } from './content';
import { LONG_DRAFTS } from './drafts-long';
import type { Level } from './levels';

/** 주제·수준에 맞는 AI 초안. 초등은 content.ts, 중·고등과 성인은 drafts-long.ts 에 있다. */
export function draftsFor(topic: Topic, level: Level = 'elem'): Record<Stance, string[]> {
  if (level === 'elem') return topic.drafts;
  return LONG_DRAFTS[topic.id]?.[level] ?? topic.drafts;
}
