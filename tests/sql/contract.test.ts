// 같은 수업 시나리오를 (1) 브라우저 데모 백엔드, (2) 실제 SQL 마이그레이션(PGlite, anon 역할)에 돌려
// 두 백엔드가 같은 규칙과 같은 응답 모양을 갖는지 확인한다.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Api, noopRealtime, type RpcFn } from '../../src/api/client';
import { MemoryStore, localRpc } from '../../src/api/local';
import { ApiError, type SessionSettings } from '../../src/api/types';

const settings: SessionSettings = { mode: 'sync', pairId: 'p1', writeSeconds: 120, retentionDays: 30, shareAllowed: true };

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof ApiError ? e.code : `other:${String(e)}`;
  }
}

interface Ctl {
  expire(code: string): Promise<void>;
}

async function scenario(api: Api, ctl: Ctl) {
  const trace: Record<string, unknown> = {};
  expect(await code(api.createSession('x', settings, '12'))).toBe('bad_pin_format');
  const { code: c, token } = await api.createSession('3학년 2반', settings, '1234');
  expect(c).toMatch(/^\d{6}$/);
  expect(token.length).toBeGreaterThanOrEqual(32);

  let pub = await api.sessionPublic(c);
  expect(pub?.stage).toBe('lobby');
  expect(pub?.participant_count).toBe(0);
  expect(pub?.share_state).toEqual({ step: 'none' });
  expect(pub?.settings).toEqual(settings);
  expect(await api.sessionPublic('000000')).toBeNull();
  trace.publicKeys = Object.keys(pub!).sort();

  // PIN 5번 틀리면 잠긴다(맞는 PIN도 거부).
  for (let i = 0; i < 5; i++) expect(await code(api.teacherLogin(c, '9999'))).toBe('bad_pin');
  expect(await code(api.teacherLogin(c, '1234'))).toBe('locked');
  expect(await code(api.teacherLogin('000000', '1234'))).toBe('not_found');

  // 참여: 닉네임 중복은 숫자를 붙인다.
  const a = await api.join(c, '민지', true);
  const b = await api.join(c, '민지', false);
  const d = await api.join(c, '  준   호  ', true);
  expect([a.nickname, b.nickname, d.nickname]).toEqual(['민지', '민지2', '준 호']);
  expect(a.spectator).toBe(false);
  expect(await code(api.join(c, '   ', true))).toBe('bad_nickname');
  expect(await code(api.join('000000', 'x', true))).toBe('not_found');
  const ca = { code: c, pid: a.participant_id, secret: a.secret };
  const cb = { code: c, pid: b.participant_id, secret: b.secret };

  const hb = await api.heartbeat(ca, 1, { f: 0.5, idle: 3 });
  expect(hb.kicked).toBe(false);
  expect(hb.session.stage).toBe('lobby');
  expect(hb.session.participant_count).toBe(3);
  expect(await code(api.heartbeat({ ...ca, secret: 'wrong' }, 1, null))).toBe('unauthorized');
  trace.heartbeatKeys = Object.keys(hb).sort();

  // 교수자 제어
  expect(await code(api.teacherUpdate(c, 'bad', { stage: 'running' }))).toBe('unauthorized');
  pub = await api.teacherUpdate(c, token, { stage: 'running' });
  expect(pub.stage).toBe('running');
  const late = await api.join(c, '늦은', true);
  expect(late.spectator).toBe(true);
  const cl = { code: c, pid: late.participant_id, secret: late.secret };

  pub = await api.teacherUpdate(c, token, { paused: true });
  expect(pub.paused).toBe(true);
  expect(pub.paused_at).not.toBeNull();
  pub = await api.teacherUpdate(c, token, { paused: false });
  expect(pub.paused_at).toBeNull();
  expect((await api.teacherUpdate(c, token, { force_phase: 9 })).force_phase).toBe(5);
  expect((await api.teacherUpdate(c, token, { force_phase: 3 })).force_phase).toBe(3);
  expect((await api.teacherUpdate(c, token, { name: '새 이름' })).name).toBe('새 이름');

  // 결과 제출
  const payload = { v: 1, metrics: { comparable: true }, note: '테스트' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await api.submitResult(ca, payload as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(await code(api.submitResult(cl, payload as any))).toBe('spectator');

  // 투표는 해당 퀴즈 라운드가 열려 있을 때만
  expect(await code(api.vote(ca, 'k-1', ['x']))).toBe('vote_closed');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quiz: any = { step: 'quiz', key: 'k-1', round: 1, rounds: 1, topic: 't', cards: [], pick: 2, reveal: false, summary: {} };
  await api.teacherUpdate(c, token, { share_state: quiz });
  await api.vote(ca, 'k-1', ['c1']);
  await api.vote(ca, 'k-1', ['c1', 'c2']);
  expect(await code(api.vote(cb, 'k-2', ['c1']))).toBe('vote_closed');
  expect(await code(api.vote(cb, 'k-1', ['a', 'b', 'c', 'd', 'e']))).toBe('bad_vote');
  await api.teacherUpdate(c, token, { share_state: { ...quiz, reveal: true } });
  expect(await code(api.vote(cb, 'k-1', ['c1']))).toBe('vote_closed');

  // 소감: 빈칸 거부, 1인 3개까지
  expect(await code(api.reflect(ca, '   '))).toBe('empty');
  await api.reflect(ca, '하나');
  await api.reflect(ca, '둘');
  await api.reflect(ca, 'x'.repeat(200));
  expect(await code(api.reflect(ca, '넷'))).toBe('limit');

  let snap = await api.teacherSnapshot(c, token);
  expect(await code(api.teacherSnapshot(c, 'bad'))).toBe('unauthorized');
  expect(snap.participants.map((p) => p.nickname)).toEqual(['민지', '민지2', '준 호', '늦은']);
  expect(snap.participants[0].phase).toBe(5);
  expect(snap.participants[1].consent).toBe(false);
  expect(snap.results).toHaveLength(1);
  expect(snap.results[0].payload).toEqual(payload);
  expect(snap.votes).toEqual([{ participant_id: a.participant_id, vote_key: 'k-1', choices: ['c1', 'c2'] }]);
  expect(snap.reflections.map((r) => r.text.length)).toEqual([2, 1, 120]);
  expect(snap.session.teacher_state).toEqual({});
  trace.snapshotKeys = Object.keys(snap).sort();
  trace.sessionKeys = Object.keys(snap.session).sort();
  trace.participantKeys = Object.keys(snap.participants[0]).sort();
  trace.resultKeys = Object.keys(snap.results[0]).sort();
  trace.reflectionKeys = Object.keys(snap.reflections[0]).sort();
  expect(JSON.stringify(snap)).not.toContain(a.secret);
  expect(JSON.stringify(snap)).not.toMatch(/pin|secret/);

  // 퇴장 · 숨기기
  await api.teacherKick(c, token, b.participant_id);
  expect((await api.heartbeat(cb, null, null)).kicked).toBe(true);
  expect(await code(api.reflect(cb, '안녕'))).toBe('kicked');
  await api.teacherHideReflection(c, token, snap.reflections[0].id, true);
  snap = await api.teacherSnapshot(c, token);
  expect(snap.reflections[0].hidden).toBe(true);
  expect((await api.sessionPublic(c))?.participant_count).toBe(2);

  // 보관 연장
  const before = Date.parse(snap.session.expires_at);
  const after = Date.parse(await api.teacherExtend(c, token, 30));
  expect(after - before).toBeGreaterThan(29 * 86400000);

  // 리포트: 수업당 하나, 다시 만들면 같은 링크
  const rid = await api.teacherCreateReport(c, token, { v: 1, n: 3 });
  expect(await api.teacherCreateReport(c, token, { v: 1, n: 4 })).toBe(rid);
  expect((await api.getReport(rid))?.snapshot).toEqual({ v: 1, n: 4 });
  expect(await api.getReport('nope')).toBeNull();

  // 다른 기기에서 PIN으로 로그인
  const s3 = await api.createSession('', settings, '5678');
  const t3 = await api.teacherLogin(s3.code, '5678');
  expect((await api.teacherSnapshot(s3.code, t3)).participants).toEqual([]);
  expect(await code(api.teacherSnapshot(s3.code, token))).toBe('unauthorized');

  // 즉시 삭제: 수업과 리포트가 함께 사라진다.
  await api.teacherDelete(c, token);
  expect(await api.sessionPublic(c)).toBeNull();
  expect(await api.getReport(rid)).toBeNull();
  expect(await code(api.heartbeat(ca, 1, null))).toBe('unauthorized');

  // 만료
  await ctl.expire(s3.code);
  expect(await api.sessionPublic(s3.code)).toBeNull();
  expect(await code(api.join(s3.code, 'x', true))).toBe('not_found');
  expect(await code(api.teacherSnapshot(s3.code, t3))).toBe('not_found');
  return trace;
}

describe('backend contract', () => {
  let sqlTrace: Record<string, unknown>;
  let localTrace: Record<string, unknown>;
  let pg: PGlite;

  beforeAll(async () => {
    pg = await PGlite.create();
    await pg.exec('create role anon; create role authenticated;');
    await pg.exec(readFileSync('supabase/migrations/20261015000000_braindebt.sql', 'utf8'));
  });

  it('SQL migration (as anon)', async () => {
    const rpc: RpcFn = async (fn, args) => {
      const keys = Object.keys(args);
      const params = keys.map((k) => {
        const v = args[k];
        return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      });
      const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
      try {
        await pg.exec('set role anon');
        const res = await pg.query<{ r: unknown }>(sql, params);
        return res.rows[0].r;
      } catch (e) {
        const m = /bd:(\w+)/.exec((e as Error).message);
        throw new ApiError(m?.[1] ?? 'sql', (e as Error).message);
      } finally {
        await pg.exec('reset role');
      }
    };
    sqlTrace = await scenario(new Api(rpc, noopRealtime, 'supabase'), {
      expire: async (code) => {
        await pg.query("update public.bd_sessions set expires_at = now() - interval '1 second' where code = $1", [code]);
      },
    });
  });

  it('anon cannot touch tables or internal helpers directly', async () => {
    await pg.exec('set role anon');
    try {
      for (const sql of [
        'select * from public.bd_sessions',
        'select * from public.bd_participants',
        "insert into public.bd_reports(id, session_code, snapshot, expires_at) values ('x','y','{}', now())",
        "select public.bd_require_teacher('1','2')",
        'select public.bd_purge()',
      ]) {
        await expect(pg.query(sql), sql).rejects.toThrow(/permission denied/);
      }
    } finally {
      await pg.exec('reset role');
    }
  });

  it('browser demo backend', async () => {
    let offset = 0;
    const store = new MemoryStore();
    localTrace = await scenario(new Api(localRpc(store, () => Date.now() + offset), noopRealtime, 'local'), {
      expire: async () => {
        offset = 200 * 86400000;
      },
    });
  });

  it('both backends return the same shapes', () => {
    expect(localTrace).toEqual(sqlTrace);
  });
});
