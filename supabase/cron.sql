-- 旧Netlify Scheduled Functions の代わり。pg_cron から mixall-api を秘密ヘッダー付きで呼ぶ。
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.mixall_cron_call(fn text) returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb := (select value from public.mixall_kv where store = 'mixall-config' and key = 'env');
begin
  perform net.http_post(
    url := (cfg->>'MIXALL_API_BASE') || '/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-mixall-cron', cfg->>'MIXALL_CRON_SECRET'),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end $$;
revoke all on function public.mixall_cron_call(text) from public, anon, authenticated;

select cron.schedule('mixall-tokibou', '* * * * *', $$select public.mixall_cron_call('scheduled-tokibou-background')$$);
select cron.schedule('mixall-uch-ai', '* * * * *', $$select public.mixall_cron_call('scheduled-uch-ai-background')$$);
select cron.schedule('mixall-ghost-moderation', '*/15 * * * *', $$select public.mixall_cron_call('scheduled-ghost-moderation-background')$$);
select cron.schedule('mixall-program-review', '*/15 * * * *', $$select public.mixall_cron_call('scheduled-program-review-background')$$);
select cron.schedule('mixall-tools-cleanup', '0 * * * *', $$select public.mixall_cron_call('scheduled-tools-cleanup')$$);
