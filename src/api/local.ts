// 브라우저 데모 백엔드: SQL 함수(supabase/migrations)를 같은 이름·같은 응답으로 흉내 낸다.
// 데이터는 IndexedDB에 저장되어 같은 브라우저의 여러 탭(교수자 화면 + 학생 탭들)이 함께 쓴다.
import { randomId, randomInt } from '../lib/random';
import type { PingKind, Realtime, RpcFn } from './client';
import { ApiError } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

interface LDb {
  v: 1;
  sessions: Record<string, J>;
  tokens: Record<string, string>;
  participants: Record<string, J>;
  results: Record<string, J>;
  votes: Record<string, J>;
  reflections: Record<string, J>;
  reports: Record<string, J>;
}

export interface Store {
  transact<T>(write: boolean, fn: (db: LDb) => T): Promise<T>;
}

const emptyDb = (): LDb => ({ v: 1, sessions: {}, tokens: {}, participants: {}, results: {}, votes: {}, reflections: {}, reports: {} });

export class MemoryStore implements Store {
  private db: LDb = emptyDb();
  async transact<T>(write: boolean, fn: (db: LDb) => T): Promise<T> {
    const work = structuredClone(this.db);
    const out = fn(work);
    if (write) this.db = work;
    return structuredClone(out);
  }
}

export class IdbStore implements Store {
  private dbp: Promise<IDBDatabase> | null = null;
  private open(): Promise<IDBDatabase> {
    this.dbp ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('braindebt-demo', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbp;
  }
  async transact<T>(write: boolean, fn: (db: LDb) => T): Promise<T> {
    const idb = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = idb.transaction('kv', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('kv');
      const req = store.get('db');
      let out: T;
      let failed: unknown = null;
      req.onsuccess = () => {
        const db: LDb = req.result ?? emptyDb();
        try {
          out = fn(db);
        } catch (e) {
          failed = e;
          tx.abort();
          return;
        }
        if (write) store.put(db, 'db');
      };
      tx.oncomplete = () => resolve(out);
      tx.onabort = () => reject(failed ?? tx.error);
      tx.onerror = () => reject(failed ?? tx.error);
    });
  }
}

const err = (code: string): never => {
  throw new ApiError(code);
};
const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 86400000;
const token = () => randomId(32);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function purge(db: LDb, now: number) {
  for (const s of Object.values(db.sessions)) if (Date.parse(s.expires_at) < now) deleteSession(db, s.code);
  for (const r of Object.values(db.reports)) if (Date.parse(r.expires_at) < now) delete db.reports[r.id];
}

function deleteSession(db: LDb, code: string) {
  delete db.sessions[code];
  for (const [k, v] of Object.entries(db.tokens)) if (v === code) delete db.tokens[k];
  for (const tbl of [db.participants, db.results, db.votes, db.reflections]) {
    for (const [k, v] of Object.entries(tbl)) if (v.session_code === code) delete tbl[k];
  }
}

function liveSession(db: LDb, code: string, now: number): J | null {
  const s = db.sessions[code];
  return s && Date.parse(s.expires_at) > now ? s : null;
}

function publicJson(db: LDb, s: J, now: number) {
  return {
    exists: true,
    code: s.code,
    name: s.name,
    stage: s.stage,
    paused: s.paused,
    paused_at: s.paused_at,
    force_phase: s.force_phase,
    share_state: s.share_state,
    settings: s.settings,
    expires_at: s.expires_at,
    participant_count: Object.values(db.participants).filter((p) => p.session_code === s.code && !p.kicked && !p.spectator).length,
    server_now: iso(now),
  };
}

function requireTeacher(db: LDb, code: string, tok: string, now: number): J {
  const s = liveSession(db, code, now) ?? err('not_found');
  if (!tok || db.tokens[tok] !== code) err('unauthorized');
  return s;
}

function requireParticipant(db: LDb, pid: string, secret: string, now: number): J {
  const p = db.participants[pid];
  if (!p || p.secret !== (secret ?? '')) err('unauthorized');
  if (!liveSession(db, p.session_code, now)) err('not_found');
  return p;
}

const size = (v: unknown) => JSON.stringify(v ?? null).length;
const isObj = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);

const FUNCS: Record<string, (db: LDb, a: J, now: number) => J> = {
  bd_create_session(db, a, now) {
    if (typeof a.p_pin !== 'string' || !/^[0-9]{4,8}$/.test(a.p_pin)) err('bad_pin_format');
    if (!isObj(a.p_settings) || size(a.p_settings) > 4000) err('bad_settings');
    purge(db, now);
    const days = clamp(Number(a.p_settings.retentionDays ?? 30) || 30, 1, 90);
    let code = '';
    for (let i = 0; ; i++) {
      code = String(100000 + randomInt(900000));
      if (!db.sessions[code] && !Object.values(db.reports).some((r) => r.session_code === code)) break;
      if (i > 50) err('no_code');
    }
    db.sessions[code] = {
      code,
      name: String(a.p_name ?? '').slice(0, 40),
      settings: a.p_settings,
      stage: 'lobby',
      paused: false,
      paused_at: null,
      force_phase: 0,
      share_state: { step: 'none' },
      teacher_state: {},
      pin: a.p_pin,
      pin_fail_count: 0,
      pin_locked_until: null,
      created_at: iso(now),
      expires_at: iso(now + days * DAY),
    };
    const t = token();
    db.tokens[t] = code;
    return { code, token: t };
  },

  bd_teacher_login(db, a, now) {
    const s = liveSession(db, a.p_code, now);
    if (!s) return { ok: false, error: 'not_found' };
    if (s.pin_locked_until && Date.parse(s.pin_locked_until) > now) {
      return { ok: false, error: 'locked', locked_until: s.pin_locked_until };
    }
    if (s.pin !== (a.p_pin ?? '')) {
      const n = s.pin_fail_count + 1;
      s.pin_fail_count = n >= 5 ? 0 : n;
      s.pin_locked_until = n >= 5 ? iso(now + 5 * 60000) : null;
      return { ok: false, error: 'bad_pin' };
    }
    s.pin_fail_count = 0;
    s.pin_locked_until = null;
    const t = token();
    db.tokens[t] = s.code;
    return { ok: true, token: t };
  },

  bd_teacher_snapshot(db, a, now) {
    const s = requireTeacher(db, a.p_code, a.p_token, now);
    const { pin: _pin, pin_fail_count: _f, pin_locked_until: _l, ...session } = s;
    const byCode = (tbl: Record<string, J>) => Object.values(tbl).filter((x) => x.session_code === s.code);
    return {
      session,
      participants: byCode(db.participants)
        .sort((x, y) => x.joined_at.localeCompare(y.joined_at) || x.nickname.localeCompare(y.nickname))
        .map(({ secret: _s, session_code: _c, ...p }) => p),
      results: byCode(db.results)
        .sort((x, y) => x.finished_at.localeCompare(y.finished_at))
        .map((r) => ({ participant_id: r.participant_id, payload: r.payload, finished_at: r.finished_at })),
      votes: byCode(db.votes)
        .sort((x, y) => x.created_at.localeCompare(y.created_at))
        .map((v) => ({ participant_id: v.participant_id, vote_key: v.vote_key, choices: v.choices })),
      reflections: byCode(db.reflections)
        .sort((x, y) => x.created_at.localeCompare(y.created_at))
        .map((f) => ({ id: f.id, participant_id: f.participant_id, text: f.text, hidden: f.hidden, created_at: f.created_at })),
      server_now: iso(now),
    };
  },

  bd_teacher_update(db, a, now) {
    const s = requireTeacher(db, a.p_code, a.p_token, now);
    const p = a.p_patch;
    if (!isObj(p) || size(p) > 300000) err('bad_patch');
    if (['lobby', 'running', 'closed'].includes(p.stage)) s.stage = p.stage;
    if ('paused' in p) {
      s.paused = !!p.paused;
      s.paused_at = p.paused ? (s.paused_at ?? iso(now)) : null;
    }
    if ('force_phase' in p) s.force_phase = clamp(Number(p.force_phase) || 0, 0, 5);
    if (isObj(p.share_state)) s.share_state = p.share_state;
    if (isObj(p.teacher_state)) s.teacher_state = p.teacher_state;
    if ('name' in p) s.name = String(p.name ?? '').slice(0, 40);
    return publicJson(db, s, now);
  },

  bd_teacher_kick(db, a, now) {
    requireTeacher(db, a.p_code, a.p_token, now);
    const p = db.participants[a.p_pid];
    if (p && p.session_code === a.p_code) p.kicked = true;
    return { ok: !!p && p.session_code === a.p_code };
  },

  bd_teacher_hide_reflection(db, a, now) {
    requireTeacher(db, a.p_code, a.p_token, now);
    const f = db.reflections[a.p_id];
    if (f && f.session_code === a.p_code) f.hidden = a.p_hidden ?? true;
    return { ok: !!f && f.session_code === a.p_code };
  },

  bd_teacher_extend(db, a, now) {
    const s = requireTeacher(db, a.p_code, a.p_token, now);
    const days = clamp(Number(a.p_days ?? 30) || 30, 1, 90);
    s.expires_at = iso(Math.min(Math.max(Date.parse(s.expires_at), now) + days * DAY, now + 180 * DAY));
    return { expires_at: s.expires_at };
  },

  bd_teacher_delete(db, a, now) {
    requireTeacher(db, a.p_code, a.p_token, now);
    for (const r of Object.values(db.reports)) if (r.session_code === a.p_code) delete db.reports[r.id];
    deleteSession(db, a.p_code);
    return { ok: true };
  },

  bd_teacher_create_report(db, a, now) {
    requireTeacher(db, a.p_code, a.p_token, now);
    if (!isObj(a.p_snapshot) || size(a.p_snapshot) > 500000) err('bad_snapshot');
    const existing = Object.values(db.reports).find((r) => r.session_code === a.p_code);
    if (existing) {
      existing.snapshot = a.p_snapshot;
      existing.created_at = iso(now);
      return { id: existing.id };
    }
    const id = randomId(12);
    db.reports[id] = { id, session_code: a.p_code, snapshot: a.p_snapshot, created_at: iso(now), expires_at: iso(now + 365 * DAY) };
    return { id };
  },

  bd_session_public(db, a, now) {
    const s = liveSession(db, a.p_code, now);
    return s ? publicJson(db, s, now) : { exists: false };
  },

  bd_join(db, a, now) {
    const s = liveSession(db, a.p_code, now) ?? err('not_found');
    if (s.stage === 'closed') err('closed');
    const mine = Object.values(db.participants).filter((p) => p.session_code === s.code);
    if (mine.length >= 300) err('full');
    const base = String(a.p_nickname ?? '').trim().replace(/\s+/g, ' ').slice(0, 12);
    if (!base) err('bad_nickname');
    let nick = base;
    for (let n = 2; mine.some((p) => p.nickname === nick); n++) nick = base + n;
    const spectator = (s.settings?.mode ?? 'sync') === 'sync' && s.stage === 'running';
    const id = crypto.randomUUID();
    const secret = token();
    db.participants[id] = {
      id,
      session_code: s.code,
      nickname: nick,
      secret,
      consent: !!a.p_consent,
      spectator,
      kicked: false,
      phase: 0,
      progress: {},
      joined_at: iso(now),
      last_seen_at: iso(now),
    };
    return { participant_id: id, secret, nickname: nick, spectator };
  },

  bd_heartbeat(db, a, now) {
    const p = requireParticipant(db, a.p_pid, a.p_secret, now);
    p.last_seen_at = iso(now);
    if (typeof a.p_phase === 'number') p.phase = clamp(a.p_phase, 0, 5);
    if (isObj(a.p_progress) && size(a.p_progress) < 2000) p.progress = a.p_progress;
    return { kicked: p.kicked, spectator: p.spectator, session: publicJson(db, db.sessions[p.session_code], now) };
  },

  bd_submit_result(db, a, now) {
    const p = requireParticipant(db, a.p_pid, a.p_secret, now);
    if (p.kicked) err('kicked');
    if (p.spectator) err('spectator');
    if (!isObj(a.p_payload) || size(a.p_payload) > 100000) err('bad_payload');
    db.results[p.id] = { participant_id: p.id, session_code: p.session_code, payload: a.p_payload, finished_at: iso(now) };
    p.phase = 5;
    p.last_seen_at = iso(now);
    return { ok: true };
  },

  bd_vote(db, a, now) {
    const p = requireParticipant(db, a.p_pid, a.p_secret, now);
    if (p.kicked) err('kicked');
    const st = db.sessions[p.session_code].share_state ?? {};
    if (st.step !== 'quiz' || st.key !== a.p_key || st.reveal) err('vote_closed');
    if (!Array.isArray(a.p_choices) || a.p_choices.length > 4) err('bad_vote');
    db.votes[`${p.id}:${a.p_key}`] = { participant_id: p.id, session_code: p.session_code, vote_key: a.p_key, choices: a.p_choices, created_at: iso(now) };
    return { ok: true };
  },

  bd_reflect(db, a, now) {
    const p = requireParticipant(db, a.p_pid, a.p_secret, now);
    if (p.kicked) err('kicked');
    const text = String(a.p_text ?? '').trim().slice(0, 120);
    if (!text) err('empty');
    if (Object.values(db.reflections).filter((f) => f.participant_id === p.id).length >= 3) err('limit');
    const id = crypto.randomUUID();
    db.reflections[id] = { id, participant_id: p.id, session_code: p.session_code, text, hidden: false, created_at: iso(now) };
    return { ok: true, id };
  },

  bd_get_report(db, a, now) {
    const r = db.reports[a.p_id];
    if (!r || Date.parse(r.expires_at) <= now) return { id: null };
    return { id: r.id, snapshot: r.snapshot, created_at: r.created_at };
  },
};

const READ_ONLY = new Set(['bd_session_public', 'bd_teacher_snapshot', 'bd_get_report']);

export function localRpc(store: Store, clock: () => number = Date.now): RpcFn {
  return (fn, args) => {
    const f = FUNCS[fn];
    if (!f) return Promise.reject(new ApiError('unknown_function', fn));
    const a = structuredClone(args);
    return store.transact(!READ_ONLY.has(fn), (db) => f(db, a, clock()));
  };
}

export function localRealtime(): Realtime {
  const name = 'braindebt-demo';
  const hasBc = typeof BroadcastChannel !== 'undefined';
  const out = hasBc ? new BroadcastChannel(name) : null;
  return {
    subscribe(code, cb) {
      if (!hasBc) return () => {};
      const ch = new BroadcastChannel(name);
      ch.onmessage = (e: MessageEvent<{ code: string; kind: PingKind }>) => {
        if (e.data?.code === code) cb(e.data.kind);
      };
      return () => ch.close();
    },
    ping(code, kind) {
      out?.postMessage({ code, kind });
    },
  };
}
