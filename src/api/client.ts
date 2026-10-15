import type { ResultPayload } from '../lib/types';
import {
  ApiError, type Cred, type HeartbeatResult, type JoinResult, type Progress, type SessionPatch, type SessionPublic,
  type SessionSettings, type TeacherSnapshot,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<any>;

export type PingKind = 'session' | 'participants' | 'results' | 'votes' | 'reflections';

export interface Realtime {
  subscribe(code: string, cb: (kind: PingKind) => void): () => void;
  ping(code: string, kind: PingKind): void;
}

/** 두 백엔드(Supabase, 브라우저 데모)가 같은 RPC 이름·인자·응답을 쓴다. */
export class Api {
  readonly kind: 'local' | 'supabase';
  private rpc: RpcFn;
  private rt: Realtime;

  constructor(rpc: RpcFn, rt: Realtime, kind: 'local' | 'supabase') {
    this.rpc = rpc;
    this.rt = rt;
    this.kind = kind;
  }

  subscribe(code: string, cb: (kind: PingKind) => void): () => void {
    return this.rt.subscribe(code, cb);
  }

  ping(code: string, kind: PingKind): void {
    this.rt.ping(code, kind);
  }

  // ---------------------------------------------------------------- 교수자
  createSession(name: string, settings: SessionSettings, pin: string): Promise<{ code: string; token: string }> {
    return this.rpc('bd_create_session', { p_name: name, p_settings: settings, p_pin: pin });
  }

  async teacherLogin(code: string, pin: string): Promise<string> {
    const r = await this.rpc('bd_teacher_login', { p_code: code, p_pin: pin });
    if (!r.ok) throw new ApiError(r.error);
    return r.token;
  }

  teacherSnapshot(code: string, token: string): Promise<TeacherSnapshot> {
    return this.rpc('bd_teacher_snapshot', { p_code: code, p_token: token });
  }

  async teacherUpdate(code: string, token: string, patch: SessionPatch): Promise<SessionPublic> {
    const r = await this.rpc('bd_teacher_update', { p_code: code, p_token: token, p_patch: patch });
    this.ping(code, 'session');
    return r;
  }

  async teacherKick(code: string, token: string, pid: string): Promise<void> {
    await this.rpc('bd_teacher_kick', { p_code: code, p_token: token, p_pid: pid });
    this.ping(code, 'session');
  }

  async teacherHideReflection(code: string, token: string, id: string, hidden: boolean): Promise<void> {
    await this.rpc('bd_teacher_hide_reflection', { p_code: code, p_token: token, p_id: id, p_hidden: hidden });
    this.ping(code, 'reflections');
  }

  async teacherExtend(code: string, token: string, days: number): Promise<string> {
    const r = await this.rpc('bd_teacher_extend', { p_code: code, p_token: token, p_days: days });
    return r.expires_at;
  }

  async teacherDelete(code: string, token: string): Promise<void> {
    await this.rpc('bd_teacher_delete', { p_code: code, p_token: token });
    this.ping(code, 'session');
  }

  async teacherCreateReport(code: string, token: string, snapshot: unknown): Promise<string> {
    const r = await this.rpc('bd_teacher_create_report', { p_code: code, p_token: token, p_snapshot: snapshot });
    return r.id;
  }

  // ---------------------------------------------------------------- 학생 · 공개
  async sessionPublic(code: string): Promise<SessionPublic | null> {
    const r = await this.rpc('bd_session_public', { p_code: code });
    return r?.exists ? r : null;
  }

  async join(code: string, nickname: string, consent: boolean): Promise<JoinResult> {
    const r = await this.rpc('bd_join', { p_code: code, p_nickname: nickname, p_consent: consent });
    this.ping(code, 'participants');
    return r;
  }

  heartbeat(cred: Cred, phase: number | null, progress: Progress | null): Promise<HeartbeatResult> {
    return this.rpc('bd_heartbeat', { p_pid: cred.pid, p_secret: cred.secret, p_phase: phase, p_progress: progress });
  }

  async submitResult(cred: Cred, payload: ResultPayload): Promise<void> {
    await this.rpc('bd_submit_result', { p_pid: cred.pid, p_secret: cred.secret, p_payload: payload });
    this.ping(cred.code, 'results');
  }

  async vote(cred: Cred, key: string, choices: string[]): Promise<void> {
    await this.rpc('bd_vote', { p_pid: cred.pid, p_secret: cred.secret, p_key: key, p_choices: choices });
    this.ping(cred.code, 'votes');
  }

  async reflect(cred: Cred, text: string): Promise<void> {
    await this.rpc('bd_reflect', { p_pid: cred.pid, p_secret: cred.secret, p_text: text });
    this.ping(cred.code, 'reflections');
  }

  async getReport(id: string): Promise<{ snapshot: unknown; created_at: string } | null> {
    const r = await this.rpc('bd_get_report', { p_id: id });
    return r?.id ? r : null;
  }
}

export const noopRealtime: Realtime = { subscribe: () => () => {}, ping: () => {} };
