-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run 하세요. (한 번만)
-- 만료된 수업 데이터를 지우는 함수와, 교수자의 "지금 삭제" 버튼이 쓰는 함수입니다.
-- 자동 배포 도구가 삭제 문장이 든 SQL을 실행하지 못해 이 두 함수만 따로 적용합니다.

create or replace function public.bd_purge() returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.bd_sessions where expires_at < now();
  delete from public.bd_reports where expires_at < now();
$$;

create or replace function public.bd_teacher_delete(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.bd_require_teacher(p_code, p_token);
  delete from public.bd_reports where session_code = p_code;
  delete from public.bd_sessions where code = p_code;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.bd_purge(), public.bd_teacher_delete(text, text) from public, anon, authenticated;
grant execute on function public.bd_teacher_delete(text, text) to anon, authenticated;
