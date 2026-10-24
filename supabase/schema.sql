-- Run once in your Supabase SQL editor. The anon key cannot bypass RLS.
create table if not exists public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
create policy "Read own workspace" on public.workspaces for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own workspace" on public.workspaces for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own workspace" on public.workspaces for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.workspaces to authenticated;
