-- Establish migration history for both fresh and existing JSON workspace installs.
create table if not exists public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
drop policy if exists "Read own workspace" on public.workspaces;
create policy "Read own workspace" on public.workspaces for select to authenticated
  using ((select auth.uid()) = user_id);
-- Write access is established only by the following revision-save migration.
