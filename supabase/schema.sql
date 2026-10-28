create table if not exists public.kv_store_6aac110b (
  key text not null primary key,
  value jsonb not null
);
alter table public.kv_store_6aac110b enable row level security;
