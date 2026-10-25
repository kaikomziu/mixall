-- Supabase の「SQL Editor」に貼り付けて Run するだけ。
-- サイト用のシンプルなキー・バリュー保存用テーブルです。
create table if not exists public.kv (
  store      text        not null,
  key        text        not null,
  value      text        not null default '',
  encoding   text        not null default 'text',   -- 'text' または 'base64'(画像・ファイル用)
  metadata   jsonb,
  updated_at timestamptz not null default now(),
  primary key (store, key)
);

create index if not exists kv_store_key_prefix on public.kv (store, key text_pattern_ops);

-- 公開キー(anon)から直接読み書きされないようにロック。
-- サーバー側(cloud-functions)は secret key で操作するので影響なし。
alter table public.kv enable row level security;
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
