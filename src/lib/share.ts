import type { Condition } from './types';

export interface SideAgg {
  n: number;
  writeSec: number;
  typed: number;
  quoteSim: number;
  clozePct: number;
  ownership: number;
  memory: number;
  /** 시험 전 예측을 기대 점수로 바꾼 평균 */
  predicted: number;
}

export interface PublicSummary {
  /** 두 글 모두 있는(비교 가능한) 완료 인원 */
  n: number;
  self: SideAgg;
  ai: SideAgg;
  /** 첫 문장 일치율 분포(인원 수) */
  hist: { bins: string[]; self: number[]; ai: number[] };
  /** 부채가 있는 학생 비율 % */
  debtShare: number;
  /** 다른 학생 글과 거의 같은(유사도 80% 이상) 글의 비율 % */
  dupRate: { self: number; ai: number };
  /** 초안 수정 비율 20% 이상 vs 미만 학생의 AI 글 기억 점수 */
  editSplit: { threshold: number; highN: number; highMemory: number; lowN: number; lowMemory: number };
  scatter: { x: number; y: number }[];
  updatedAt: number;
}

export interface GalleryItem {
  id: string;
  condition: Condition;
  topic: string;
  original: string;
  recalled: string;
  sim: number;
}

export interface QuizCard {
  id: string;
  text: string;
}

export interface QuizRoundPlan {
  key: string;
  topic: string;
  cards: QuizCard[];
  aiIds: string[];
}

export type ShareState =
  | { step: 'none' }
  | { step: 'results'; summary: PublicSummary }
  | { step: 'gallery'; summary: PublicSummary; item: GalleryItem | null; index: number; total: number }
  | {
      step: 'quiz';
      summary: PublicSummary;
      key: string;
      round: number;
      rounds: number;
      topic: string;
      cards: QuizCard[];
      pick: number;
      reveal: boolean;
      answer?: string[];
    }
  | { step: 'discuss'; summary: PublicSummary }
  | { step: 'wall'; summary: PublicSummary };

export type ShareStep = ShareState['step'];

export interface TeacherState {
  quiz?: { planId: string; plan: QuizRoundPlan[] };
  gallery?: GalleryItem[];
  reportId?: string;
}

export const SHARE_STEPS: { step: Exclude<ShareStep, 'none'>; label: string }[] = [
  { step: 'results', label: '반 결과' },
  { step: 'gallery', label: '겹쳐보기' },
  { step: 'quiz', label: '누가 썼을까?' },
  { step: 'discuss', label: '토론' },
  { step: 'wall', label: '소감 벽' },
];

export const DISCUSSION_QUESTIONS = [
  'AI 글은 방금 읽었는데 왜 기억이 안 날까? 직접 쓴 글은 왜 기억날까?',
  'AI 초안을 많이 고친 친구들은 기억이 더 좋았을까?',
  'AI와 글을 쓰더라도 "내 글"로 남기려면 어떻게 써야 할까?',
];
