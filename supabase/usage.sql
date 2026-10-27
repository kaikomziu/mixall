-- 運営画面「📈 使用量パネル」用の内訳。Supabase の SQL Editor で1回だけ実行してください（何度実行しても同じ結果になります）。
-- サーバー（server/plus.js の usage）が secret key（service_role）で rpc('mixall_usage_detail') を呼ぶ。
-- 返す内容:
--   db_bytes        データベース全体の大きさ（pg_database_size）
--   kv_rows         public.kv の行数
--   stores          store ごとの { store, rows, bytes }（bytes = value の合計バイト数、bytes の大きい順）
--   cron_runs_24h   pg_cron の直近24時間の実行数（cron.job_run_details）
--   cron_failed_24h そのうち status = 'failed' の数
-- pg_cron が入っていないプロジェクトでも作れるように、cron の表は存在を確かめてから動的 SQL で読む（無ければ 0）。
create or replace function public.mixall_usage_detail()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_db_bytes  bigint;
  v_kv_rows   bigint;
  v_stores    json;
  v_cron_runs bigint := 0;
  v_cron_fail bigint := 0;
begin
  v_db_bytes := pg_database_size(current_database());

  select count(*) into v_kv_rows from public.kv;

  select coalesce(json_agg(json_build_object('store', s.store, 'rows', s.rows, 'bytes', s.bytes) order by s.bytes desc, s.store), '[]'::json)
    into v_stores
    from (
      select k.store, count(*) as rows, coalesce(sum(octet_length(k.value)), 0)::bigint as bytes
        from public.kv k
       group by k.store
    ) s;

  if to_regclass('cron.job_run_details') is not null then
    execute $q$
      select count(*), count(*) filter (where status = 'failed')
        from cron.job_run_details
       where start_time >= now() - interval '24 hours'
    $q$ into v_cron_runs, v_cron_fail;
  end if;

  return json_build_object(
    'db_bytes', v_db_bytes,
    'kv_rows', v_kv_rows,
    'stores', v_stores,
    'cron_runs_24h', v_cron_runs,
    'cron_failed_24h', v_cron_fail
  );
end;
$$;
revoke all on function public.mixall_usage_detail() from public, anon, authenticated;
grant execute on function public.mixall_usage_detail() to service_role;
