-- 定期実行の設定(EdgeOne版の定期実行設定)。
-- ★ 下の YOUR-SITE を、EdgeOneのドメイン(例: abc123.edgeone.app)に書き換えてから Run してください。
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobname) from cron.job where jobname like 'mixall-%';

select cron.schedule('mixall-tokibou',         '* * * * *',    $$select net.http_post(url:='https://YOUR-SITE/api/scheduled-tokibou-background',          headers:='{"x-cron-secret":"YOUR-CRON-SECRET","Content-Type":"application/json"}'::jsonb, body:='{}'::jsonb, timeout_milliseconds:=60000)$$);
select cron.schedule('mixall-uch-ai',          '* * * * *',    $$select net.http_post(url:='https://YOUR-SITE/api/scheduled-uch-ai-background',           headers:='{"x-cron-secret":"YOUR-CRON-SECRET","Content-Type":"application/json"}'::jsonb, body:='{}'::jsonb, timeout_milliseconds:=60000)$$);
select cron.schedule('mixall-ai-sweep',        '* * * * *',    $$select net.http_post(url:='https://YOUR-SITE/api/ai-sweep',                              headers:='{"x-cron-secret":"YOUR-CRON-SECRET","Content-Type":"application/json"}'::jsonb, body:='{}'::jsonb, timeout_milliseconds:=60000)$$);
select cron.schedule('mixall-ghost-moderation','*/15 * * * *', $$select net.http_post(url:='https://YOUR-SITE/api/scheduled-ghost-moderation-background', headers:='{"x-cron-secret":"YOUR-CRON-SECRET","Content-Type":"application/json"}'::jsonb, body:='{}'::jsonb, timeout_milliseconds:=60000)$$);
select cron.schedule('mixall-program-review',  '*/15 * * * *', $$select net.http_post(url:='https://YOUR-SITE/api/scheduled-program-review-background',  headers:='{"x-cron-secret":"YOUR-CRON-SECRET","Content-Type":"application/json"}'::jsonb, body:='{}'::jsonb, timeout_milliseconds:=60000)$$);
select cron.schedule('mixall-tools-cleanup',   '0 * * * *',    $$select net.http_post(url:='https://YOUR-SITE/api/scheduled-tools-cleanup',               headers:='{"x-cron-secret":"YOUR-CRON-SECRET","Content-Type":"application/json"}'::jsonb, body:='{}'::jsonb, timeout_milliseconds:=60000)$$);
select cron.schedule('mixall-auto-compact',     '*/10 * * * *', $$select net.http_post(url:='https://YOUR-SITE/api/auto-compact',                       headers:='{"x-cron-secret":"YOUR-CRON-SECRET"}'::jsonb, body:='{}'::jsonb)$$);
