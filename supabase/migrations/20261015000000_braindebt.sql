-- braindebt: 인지 부채 체험 수업용 스키마
-- 모든 접근은 아래 security definer 함수(RPC)로만 한다. 테이블은 RLS로 잠그고 anon 권한을 회수한다.
-- 교수자는 수업 생성 때 받은 토큰(또는 PIN 로그인으로 받은 토큰), 학생은 참여 때 받은 비밀값으로 인증한다.

create table if not exists public.bd_sessions (
  code text primary key,
  name text not null default '',
  settings jsonb not null default '{}'::jsonb,
  stage text not null default 'lobby' check (stage in ('lobby', 'running', 'closed')),
  paused boolean not null default false,
  paused_at timestamptz,
  force_phase int not null default 0,
  share_state jsonb not null default '{"step":"none"}'::jsonb,
  teacher_state jsonb not null default '{}'::jsonb,
  pin_hash text not null,
  pin_fail_count int not null default 0,
  pin_locked_until timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.bd_teacher_tokens (
  token_hash text primary key,
  session_code text not null references public.bd_sessions(code) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.bd_participants (
  id uuid primary key default gen_random_uuid(),
  session_code text not null references public.bd_sessions(code) on delete cascade,
  nickname text not null,
  secret_hash text not null,
  consent boolean not null default true,
  spectator boolean not null default false,
  kicked boolean not null default false,
  phase int not null default 0,
  progress jsonb not null default '{}'::jsonb,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (session_code, nickname)
);
create index if not exists bd_participants_session on public.bd_participants(session_code);

create table if not exists public.bd_results (
  participant_id uuid primary key references public.bd_participants(id) on delete cascade,
  session_code text not null references public.bd_sessions(code) on delete cascade,
  payload jsonb not null,
  finished_at timestamptz not null default now()
);
create index if not exists bd_results_session on public.bd_results(session_code);

create table if not exists public.bd_votes (
  participant_id uuid not null references public.bd_participants(id) on delete cascade,
  session_code text not null references public.bd_sessions(code) on delete cascade,
  vote_key text not null,
  choices jsonb not null,
  created_at timestamptz not null default now(),
  primary key (participant_id, vote_key)
);
create index if not exists bd_votes_session on public.bd_votes(session_code);

create table if not exists public.bd_reflections (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.bd_participants(id) on delete cascade,
  session_code text not null references public.bd_sessions(code) on delete cascade,
  text text not null check (char_length(text) between 1 and 120),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bd_reflections_session on public.bd_reflections(session_code);

-- 수업 리포트: 익명 집계 스냅샷. 수업 데이터가 만료돼도 1년간 남는다(교수자가 수업을 직접 삭제하면 함께 삭제).
create table if not exists public.bd_reports (
  id text primary key,
  session_code text not null unique,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.bd_sessions enable row level security;
alter table public.bd_teacher_tokens enable row level security;
alter table public.bd_participants enable row level security;
alter table public.bd_results enable row level security;
alter table public.bd_votes enable row level security;
alter table public.bd_reflections enable row level security;
alter table public.bd_reports enable row level security;

revoke all on table public.bd_sessions, public.bd_teacher_tokens, public.bd_participants, public.bd_results,
  public.bd_votes, public.bd_reflections, public.bd_reports from anon, authenticated;

-- ------------------------------------------------------------------ 내부 도우미

create or replace function public.bd_hash(t text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select encode(sha256(convert_to(t, 'UTF8')), 'hex')
$$;

create or replace function public.bd_token() returns text
language sql volatile set search_path = public, pg_temp as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

create or replace function public.bd_err(p_code text) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'bd:%', p_code using errcode = 'P0001';
end $$;

create or replace function public.bd_purge() returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.bd_sessions where expires_at < now();
  delete from public.bd_reports where expires_at < now();
$$;

create or replace function public.bd_public_json(s public.bd_sessions) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'exists', true,
    'code', s.code,
    'name', s.name,
    'stage', s.stage,
    'paused', s.paused,
    'paused_at', s.paused_at,
    'force_phase', s.force_phase,
    'share_state', s.share_state,
    'settings', s.settings,
    'expires_at', s.expires_at,
    'participant_count', (select count(*) from public.bd_participants p where p.session_code = s.code and not p.kicked and not p.spectator),
    'server_now', now()
  )
$$;

create or replace function public.bd_require_teacher(p_code text, p_token text) returns public.bd_sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.bd_sessions;
begin
  select * into s from public.bd_sessions where code = p_code and expires_at > now();
  if not found then perform public.bd_err('not_found'); end if;
  if p_token is null or not exists (
    select 1 from public.bd_teacher_tokens t where t.session_code = p_code and t.token_hash = public.bd_hash(p_token)
  ) then
    perform public.bd_err('unauthorized');
  end if;
  return s;
end $$;

create or replace function public.bd_require_participant(p_pid uuid, p_secret text) returns public.bd_participants
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.bd_participants;
begin
  select * into p from public.bd_participants where id = p_pid;
  if not found or p.secret_hash <> public.bd_hash(coalesce(p_secret, '')) then perform public.bd_err('unauthorized'); end if;
  if not exists (select 1 from public.bd_sessions where code = p.session_code and expires_at > now()) then
    perform public.bd_err('not_found');
  end if;
  return p;
end $$;

-- ------------------------------------------------------------------ 교수자

create or replace function public.bd_create_session(p_name text, p_settings jsonb, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_code text;
  v_token text;
  v_days int;
  i int := 0;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then perform public.bd_err('bad_pin_format'); end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' or pg_column_size(p_settings) > 4000 then
    perform public.bd_err('bad_settings');
  end if;
  perform public.bd_purge();
  v_days := least(greatest(coalesce((p_settings->>'retentionDays')::int, 30), 1), 90);
  loop
    v_code := (100000 + floor(random() * 900000))::int::text;
    exit when not exists (select 1 from public.bd_sessions where code = v_code)
      and not exists (select 1 from public.bd_reports where session_code = v_code);
    i := i + 1;
    if i > 50 then perform public.bd_err('no_code'); end if;
  end loop;
  insert into public.bd_sessions (code, name, settings, pin_hash, expires_at)
  values (v_code, left(coalesce(p_name, ''), 40), p_settings, public.bd_hash(v_code || ':' || p_pin), now() + make_interval(days => v_days));
  v_token := public.bd_token();
  insert into public.bd_teacher_tokens (token_hash, session_code) values (public.bd_hash(v_token), v_code);
  return jsonb_build_object('code', v_code, 'token', v_token);
end $$;

-- 실패해도 예외를 던지지 않고 ok:false를 돌려준다(예외를 던지면 실패 횟수 갱신이 롤백된다).
create or replace function public.bd_teacher_login(p_code text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.bd_sessions;
  v_token text;
begin
  select * into s from public.bd_sessions where code = p_code and expires_at > now() for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if s.pin_locked_until is not null and s.pin_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', s.pin_locked_until);
  end if;
  if s.pin_hash <> public.bd_hash(p_code || ':' || coalesce(p_pin, '')) then
    update public.bd_sessions
      set pin_fail_count = case when pin_fail_count + 1 >= 5 then 0 else pin_fail_count + 1 end,
          pin_locked_until = case when pin_fail_count + 1 >= 5 then now() + interval '5 minutes' else null end
      where code = p_code;
    return jsonb_build_object('ok', false, 'error', 'bad_pin');
  end if;
  update public.bd_sessions set pin_fail_count = 0, pin_locked_until = null where code = p_code;
  v_token := public.bd_token();
  insert into public.bd_teacher_tokens (token_hash, session_code) values (public.bd_hash(v_token), p_code);
  return jsonb_build_object('ok', true, 'token', v_token);
end $$;

create or replace function public.bd_teacher_snapshot(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.bd_sessions;
begin
  s := public.bd_require_teacher(p_code, p_token);
  return jsonb_build_object(
    'session', to_jsonb(s) - 'pin_hash' - 'pin_fail_count' - 'pin_locked_until',
    'participants', coalesce((
      select jsonb_agg(to_jsonb(p) - 'secret_hash' - 'session_code' order by p.joined_at, p.nickname)
      from public.bd_participants p where p.session_code = p_code), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(jsonb_build_object('participant_id', r.participant_id, 'payload', r.payload, 'finished_at', r.finished_at) order by r.finished_at)
      from public.bd_results r where r.session_code = p_code), '[]'::jsonb),
    'votes', coalesce((
      select jsonb_agg(jsonb_build_object('participant_id', v.participant_id, 'vote_key', v.vote_key, 'choices', v.choices) order by v.created_at)
      from public.bd_votes v where v.session_code = p_code), '[]'::jsonb),
    'reflections', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'participant_id', f.participant_id, 'text', f.text, 'hidden', f.hidden, 'created_at', f.created_at) order by f.created_at)
      from public.bd_reflections f where f.session_code = p_code), '[]'::jsonb),
    'server_now', now()
  );
end $$;

create or replace function public.bd_teacher_update(p_code text, p_token text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.bd_sessions;
begin
  s := public.bd_require_teacher(p_code, p_token);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or pg_column_size(p_patch) > 300000 then
    perform public.bd_err('bad_patch');
  end if;
  update public.bd_sessions set
    stage = case when p_patch->>'stage' in ('lobby', 'running', 'closed') then p_patch->>'stage' else stage end,
    paused = case when p_patch ? 'paused' then (p_patch->>'paused')::boolean else paused end,
    paused_at = case
      when not (p_patch ? 'paused') then paused_at
      when (p_patch->>'paused')::boolean then coalesce(paused_at, now())
      else null end,
    force_phase = case when p_patch ? 'force_phase' then least(greatest((p_patch->>'force_phase')::int, 0), 5) else force_phase end,
    share_state = case when jsonb_typeof(p_patch->'share_state') = 'object' then p_patch->'share_state' else share_state end,
    teacher_state = case when jsonb_typeof(p_patch->'teacher_state') = 'object' then p_patch->'teacher_state' else teacher_state end,
    name = case when p_patch ? 'name' then left(coalesce(p_patch->>'name', ''), 40) else name end
  where code = p_code
  returning * into s;
  return public.bd_public_json(s);
end $$;

create or replace function public.bd_teacher_kick(p_code text, p_token text, p_pid uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.bd_require_teacher(p_code, p_token);
  update public.bd_participants set kicked = true where id = p_pid and session_code = p_code;
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.bd_teacher_hide_reflection(p_code text, p_token text, p_id uuid, p_hidden boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.bd_require_teacher(p_code, p_token);
  update public.bd_reflections set hidden = coalesce(p_hidden, true) where id = p_id and session_code = p_code;
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.bd_teacher_extend(p_code text, p_token text, p_days int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_exp timestamptz;
begin
  perform public.bd_require_teacher(p_code, p_token);
  update public.bd_sessions
    set expires_at = least(greatest(expires_at, now()) + make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90)), now() + interval '180 days')
    where code = p_code
    returning expires_at into v_exp;
  return jsonb_build_object('expires_at', v_exp);
end $$;

create or replace function public.bd_teacher_delete(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.bd_require_teacher(p_code, p_token);
  delete from public.bd_reports where session_code = p_code;
  delete from public.bd_sessions where code = p_code;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.bd_teacher_create_report(p_code text, p_token text, p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id text;
begin
  perform public.bd_require_teacher(p_code, p_token);
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' or pg_column_size(p_snapshot) > 500000 then
    perform public.bd_err('bad_snapshot');
  end if;
  insert into public.bd_reports (id, session_code, snapshot, expires_at)
  values (substr(public.bd_token(), 1, 12), p_code, p_snapshot, now() + interval '365 days')
  on conflict (session_code) do update set snapshot = excluded.snapshot, created_at = now()
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- ------------------------------------------------------------------ 학생 · 공개

create or replace function public.bd_session_public(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s public.bd_sessions;
begin
  select * into s from public.bd_sessions where code = p_code and expires_at > now();
  if not found then return jsonb_build_object('exists', false); end if;
  return public.bd_public_json(s);
end $$;

create or replace function public.bd_join(p_code text, p_nickname text, p_consent boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.bd_sessions;
  v_base text;
  v_nick text;
  v_n int := 1;
  v_secret text;
  v_id uuid;
  v_spectator boolean;
begin
  select * into s from public.bd_sessions where code = p_code and expires_at > now();
  if not found then perform public.bd_err('not_found'); end if;
  if s.stage = 'closed' then perform public.bd_err('closed'); end if;
  if (select count(*) from public.bd_participants where session_code = p_code) >= 300 then perform public.bd_err('full'); end if;
  v_base := left(regexp_replace(btrim(coalesce(p_nickname, '')), '\s+', ' ', 'g'), 12);
  if char_length(v_base) < 1 then perform public.bd_err('bad_nickname'); end if;
  v_spectator := coalesce(s.settings->>'mode', 'sync') = 'sync' and s.stage = 'running';
  v_secret := public.bd_token();
  v_nick := v_base;
  loop
    while exists (select 1 from public.bd_participants where session_code = p_code and nickname = v_nick) loop
      v_n := v_n + 1;
      v_nick := v_base || v_n::text;
    end loop;
    begin
      insert into public.bd_participants (session_code, nickname, secret_hash, consent, spectator)
      values (p_code, v_nick, public.bd_hash(v_secret), coalesce(p_consent, false), v_spectator)
      returning id into v_id;
      exit;
    exception when unique_violation then
      v_n := v_n + 1;
      v_nick := v_base || v_n::text;
    end;
  end loop;
  return jsonb_build_object('participant_id', v_id, 'secret', v_secret, 'nickname', v_nick, 'spectator', v_spectator);
end $$;

create or replace function public.bd_heartbeat(p_pid uuid, p_secret text, p_phase int, p_progress jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.bd_participants;
  s public.bd_sessions;
begin
  p := public.bd_require_participant(p_pid, p_secret);
  update public.bd_participants set
    last_seen_at = now(),
    phase = coalesce(least(greatest(p_phase, 0), 5), phase),
    progress = case when jsonb_typeof(p_progress) = 'object' and pg_column_size(p_progress) < 2000 then p_progress else progress end
  where id = p_pid;
  select * into s from public.bd_sessions where code = p.session_code;
  return jsonb_build_object('kicked', p.kicked, 'spectator', p.spectator, 'session', public.bd_public_json(s));
end $$;

create or replace function public.bd_submit_result(p_pid uuid, p_secret text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.bd_participants;
begin
  p := public.bd_require_participant(p_pid, p_secret);
  if p.kicked then perform public.bd_err('kicked'); end if;
  if p.spectator then perform public.bd_err('spectator'); end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 100000 then
    perform public.bd_err('bad_payload');
  end if;
  insert into public.bd_results (participant_id, session_code, payload)
  values (p_pid, p.session_code, p_payload)
  on conflict (participant_id) do update set payload = excluded.payload, finished_at = now();
  update public.bd_participants set phase = 5, last_seen_at = now() where id = p_pid;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.bd_vote(p_pid uuid, p_secret text, p_key text, p_choices jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.bd_participants;
  s public.bd_sessions;
begin
  p := public.bd_require_participant(p_pid, p_secret);
  if p.kicked then perform public.bd_err('kicked'); end if;
  select * into s from public.bd_sessions where code = p.session_code;
  if s.share_state->>'step' is distinct from 'quiz'
     or s.share_state->>'key' is distinct from p_key
     or coalesce((s.share_state->>'reveal')::boolean, false) then
    perform public.bd_err('vote_closed');
  end if;
  if jsonb_typeof(p_choices) is distinct from 'array' or jsonb_array_length(p_choices) > 4 then
    perform public.bd_err('bad_vote');
  end if;
  insert into public.bd_votes (participant_id, session_code, vote_key, choices)
  values (p_pid, p.session_code, p_key, p_choices)
  on conflict (participant_id, vote_key) do update set choices = excluded.choices, created_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.bd_reflect(p_pid uuid, p_secret text, p_text text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.bd_participants;
  v_text text;
  v_id uuid;
begin
  p := public.bd_require_participant(p_pid, p_secret);
  if p.kicked then perform public.bd_err('kicked'); end if;
  v_text := left(btrim(coalesce(p_text, '')), 120);
  if char_length(v_text) < 1 then perform public.bd_err('empty'); end if;
  if (select count(*) from public.bd_reflections where participant_id = p_pid) >= 3 then perform public.bd_err('limit'); end if;
  insert into public.bd_reflections (participant_id, session_code, text) values (p_pid, p.session_code, v_text) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.bd_get_report(p_id text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select jsonb_build_object('id', r.id, 'snapshot', r.snapshot, 'created_at', r.created_at)
       from public.bd_reports r where r.id = p_id and r.expires_at > now()),
    jsonb_build_object('id', null)
  )
$$;

-- ------------------------------------------------------------------ 권한

revoke all on function
  public.bd_hash(text), public.bd_token(), public.bd_err(text), public.bd_purge(),
  public.bd_public_json(public.bd_sessions), public.bd_require_teacher(text, text), public.bd_require_participant(uuid, text),
  public.bd_create_session(text, jsonb, text), public.bd_teacher_login(text, text), public.bd_teacher_snapshot(text, text),
  public.bd_teacher_update(text, text, jsonb), public.bd_teacher_kick(text, text, uuid),
  public.bd_teacher_hide_reflection(text, text, uuid, boolean), public.bd_teacher_extend(text, text, int),
  public.bd_teacher_delete(text, text), public.bd_teacher_create_report(text, text, jsonb),
  public.bd_session_public(text), public.bd_join(text, text, boolean), public.bd_heartbeat(uuid, text, int, jsonb),
  public.bd_submit_result(uuid, text, jsonb), public.bd_vote(uuid, text, text, jsonb), public.bd_reflect(uuid, text, text),
  public.bd_get_report(text)
from public, anon, authenticated;

grant execute on function
  public.bd_create_session(text, jsonb, text), public.bd_teacher_login(text, text), public.bd_teacher_snapshot(text, text),
  public.bd_teacher_update(text, text, jsonb), public.bd_teacher_kick(text, text, uuid),
  public.bd_teacher_hide_reflection(text, text, uuid, boolean), public.bd_teacher_extend(text, text, int),
  public.bd_teacher_delete(text, text), public.bd_teacher_create_report(text, text, jsonb),
  public.bd_session_public(text), public.bd_join(text, text, boolean), public.bd_heartbeat(uuid, text, int, jsonb),
  public.bd_submit_result(uuid, text, jsonb), public.bd_vote(uuid, text, text, jsonb), public.bd_reflect(uuid, text, text),
  public.bd_get_report(text)
to anon, authenticated;
