-- 運営画面の「Supabase 残り容量」メーター用。SupabaseのSQL Editorで1回だけ実行してください。
create or replace function public.mixall_db_usage()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'db_bytes', pg_database_size(current_database()),
    'kv_bytes', pg_total_relation_size('public.kv'),
    'kv_rows', (select count(*) from public.kv)
  );
$$;
revoke all on function public.mixall_db_usage() from public, anon, authenticated;
grant execute on function public.mixall_db_usage() to service_role;
