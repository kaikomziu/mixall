-- GitHub Pages 版（EdgeOne版 v27c ベース）の Supabase 側の設定。適用済みの内容の記録。
-- データは public.kv（EdgeOne版と同じ形式。テーブル定義は supabase/edgeone/schema.sql）。
-- 設定値は kv の store='mixall-config' key='env'（MIXALL_API_BASE, CRON_SECRET, AGENTMAIL_API_KEY, AGENTMAIL_INBOX, MIXALL_SITE_URL, VAPID など）。
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 定期処理を呼ぶ。やることが無いときは Edge Function を起動しない（使用量の節約）。
-- 圧縮された行（encoding<>'text'）はSQLで中身を読めないので「仕事あり」とみなす。
create or replace function public.mixall_cron_call2(fn text) returns void language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb := (select value::jsonb from public.kv where store = 'mixall-config' and key = 'env');
  hhmm text := to_char(now() at time zone 'Asia/Tokyo', 'HH24:MI');
begin
  if fn = 'scheduled-uch-ai-background' and not exists (
    select 1 from public.kv where store = 'netrify-uch-ai-jobs' and key <> '__worker-lock'
      and (encoding <> 'text' or coalesce(value::jsonb->>'status', '') not in ('failed', 'complete', 'done'))) then return; end if;
  if fn = 'ai-sweep' and not exists (
    select 1 from public.kv where store = 'netrify-ai-background-jobs'
      and (encoding <> 'text' or coalesce(value::jsonb->>'status', '') not in ('failed', 'done'))) then return; end if;
  -- 時報bot: いまの時刻（日本時間）に投稿するbotがあるときだけ（netrify-uch-bots は自動圧縮の対象から外してある）
  if fn = 'scheduled-tokibou-background' and not exists (
    select 1 from public.kv k, jsonb_array_elements(case when k.encoding = 'text' and jsonb_typeof(k.value::jsonb) = 'array' then k.value::jsonb else '[]'::jsonb end) b
    where k.store = 'netrify-uch-bots' and b->>'triggerType' = 'routine' and coalesce(b->'times', '[]'::jsonb) ? hhmm) then return; end if;
  perform net.http_post(
    url := (cfg->>'MIXALL_API_BASE') || '/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', cfg->>'CRON_SECRET'),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end $$;
revoke all on function public.mixall_cron_call2(text) from public, anon, authenticated;

select cron.unschedule(jobname) from cron.job where jobname like 'mixall-%' and jobname <> 'mixall-housekeeping';
select cron.schedule('mixall-tokibou',          '* * * * *',    $$select public.mixall_cron_call2('scheduled-tokibou-background')$$);
select cron.schedule('mixall-uch-ai',           '* * * * *',    $$select public.mixall_cron_call2('scheduled-uch-ai-background')$$);
select cron.schedule('mixall-ai-sweep',         '* * * * *',    $$select public.mixall_cron_call2('ai-sweep')$$);
select cron.schedule('mixall-ghost-moderation', '*/15 * * * *', $$select public.mixall_cron_call2('scheduled-ghost-moderation-background')$$);
select cron.schedule('mixall-program-review',   '*/15 * * * *', $$select public.mixall_cron_call2('scheduled-program-review-background')$$);
select cron.schedule('mixall-tools-cleanup',    '7 * * * *',    $$select public.mixall_cron_call2('scheduled-tools-cleanup')$$);
select cron.schedule('mixall-auto-compact',     '37 * * * *',   $$select public.mixall_cron_call2('auto-compact')$$);

-- 毎日の掃除（pg_cron の実行履歴と pg_net の応答記録）
create or replace function public.mixall_housekeeping() returns void language plpgsql security definer set search_path = public as $$
begin
  delete from cron.job_run_details where end_time < now() - interval '2 days';
  delete from net._http_response where created < now() - interval '1 hour';
end $$;
select cron.schedule('mixall-housekeeping', '17 3 * * *', $$select public.mixall_housekeeping()$$);
-- 毎日 03:30（日本時間）に kaikomziu/mixall-data が古い行を GitHub へ移して Supabase から消す（server/archive-job.js）。
-- 消しただけではファイルが縮まないので、05:00（日本時間）に kv を詰め直す（数秒だけ kv がロックされる）
select cron.schedule('mixall-kv-vacuum', '0 20 * * *', 'vacuum full public.kv');

-- 旧版のテーブル mixall_kv は 2026-10-25 に kv へ写し終えて削除した（mixall_copy_to_kv() も削除）。
-- mixall_restore_vault_into_kv() は端末保存チャットの本文のうち、受け渡し箱 mixall_chat_inbox に残っていた分を戻した関数。
