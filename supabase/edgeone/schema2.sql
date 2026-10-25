-- 第2のSupabaseプロジェクト(直列つなぎ用)の初期設定。第2プロジェクトのSQL Editorで1回だけ Run。
create table if not exists public.kv (
  store text not null, key text not null, value text not null default '',
  encoding text not null default 'text', metadata jsonb, updated_at timestamptz not null default now(),
  primary key (store, key)
);
create index if not exists kv_store_key_prefix on public.kv (store, key text_pattern_ops);
alter table public.kv enable row level security;

-- secret keyで動かすのでanon用ポリシーは不要(作らないほうが安全)。

-- 容量メーター用(任意)
create or replace function public.mixall_db_usage() returns json language sql security definer set search_path = public as $$
  select json_build_object('db_bytes', pg_database_size(current_database()), 'kv_bytes', pg_total_relation_size('public.kv'), 'kv_rows', (select count(*) from public.kv));
$$;
