import type { ResultPayload } from '../lib/types';
import type { ShareState, TeacherState } from '../lib/share';

export type Stage = 'lobby' | 'running' | 'closed';
export type Mode = 'sync' | 'async';

export interface SessionSettings {
  mode: Mode;
  pairId: string;
  writeSeconds: number;
  retentionDays: number;
  shareAllowed: boolean;
}

export interface SessionPublic {
  exists: true;
  code: string;
  name: string;
  stage: Stage;
  paused: boolean;
  paused_at: string | null;
  force_phase: number;
  share_state: ShareState;
  settings: SessionSettings;
  expires_at: string;
  participant_count: number;
  server_now: string;
}

export interface Progress {
  /** 단계 안 진행률 0~1 */
  f?: number;
  /** 마지막 입력 후 지난 초 */
  idle?: number;
  /** 시험 세부 단계 등 */
  step?: string;
}

export interface ParticipantRow {
  id: string;
  nickname: string;
  consent: boolean;
  spectator: boolean;
  kicked: boolean;
  phase: number;
  progress: Progress;
  joined_at: string;
  last_seen_at: string;
}

export interface ResultRow {
  participant_id: string;
  payload: ResultPayload;
  finished_at: string;
}

export interface VoteRow {
  participant_id: string;
  vote_key: string;
  choices: string[];
}

export interface ReflectionRow {
  id: string;
  participant_id: string;
  text: string;
  hidden: boolean;
  created_at: string;
}

export interface SessionRow {
  code: string;
  name: string;
  settings: SessionSettings;
  stage: Stage;
  paused: boolean;
  paused_at: string | null;
  force_phase: number;
  share_state: ShareState;
  teacher_state: TeacherState;
  created_at: string;
  expires_at: string;
}

export interface TeacherSnapshot {
  session: SessionRow;
  participants: ParticipantRow[];
  results: ResultRow[];
  votes: VoteRow[];
  reflections: ReflectionRow[];
  server_now: string;
}

export interface JoinResult {
  participant_id: string;
  secret: string;
  nickname: string;
  spectator: boolean;
}

export interface Cred {
  code: string;
  pid: string;
  secret: string;
}

export interface HeartbeatResult {
  kicked: boolean;
  spectator: boolean;
  session: SessionPublic;
}

export interface SessionPatch {
  stage?: Stage;
  paused?: boolean;
  force_phase?: number;
  share_state?: ShareState;
  teacher_state?: TeacherState;
  name?: string;
}

export class ApiError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export const ERROR_TEXT: Record<string, string> = {
  not_found: '수업을 찾을 수 없어요. 코드를 다시 확인해 주세요.',
  closed: '이미 끝난 수업이에요.',
  full: '참여 인원이 가득 찼어요.',
  bad_nickname: '닉네임을 입력해 주세요.',
  unauthorized: '권한이 없어요. 다시 로그인해 주세요.',
  bad_pin: 'PIN이 맞지 않아요.',
  bad_pin_format: 'PIN은 숫자 4~8자리로 정해 주세요.',
  locked: 'PIN을 여러 번 틀려서 5분 동안 잠겼어요.',
  vote_closed: '투표가 이미 마감됐어요.',
  limit: '소감은 3개까지 보낼 수 있어요.',
  empty: '내용을 입력해 주세요.',
  kicked: '수업에서 퇴장되었어요.',
  delete_not_ready: '삭제 기능이 아직 설정되지 않았어요. supabase/manual/01_delete_functions.sql 을 Supabase에서 한 번 실행해 주세요.',
  network: '연결이 불안정해요. 잠시 후 다시 시도해 주세요.',
};

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return ERROR_TEXT[e.code] ?? e.message;
  return ERROR_TEXT.network;
}
