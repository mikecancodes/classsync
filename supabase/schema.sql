-- Fresh setup or SQL-editor upgrade. Prefer versioned migrations for managed projects.
-- Run this complete script, not the old last-write-wins schema.
begin;
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
-- Existing JSON workspaces remain intact. Only this save protocol may mutate them.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- One recovery copy per existing user at migration time; not exposed to clients.
create table if not exists private.workspace_revision_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  original_updated_at timestamptz not null,
  backed_up_at timestamptz not null default now()
);
alter table private.workspace_revision_backups enable row level security;
revoke all on private.workspace_revision_backups from public, anon, authenticated;
insert into private.workspace_revision_backups (user_id, data, original_updated_at)
select user_id, data, updated_at from public.workspaces
on conflict (user_id) do nothing;

alter table public.workspaces add column if not exists revision integer not null default 1
  check (revision > 0);

-- Old clients using upsert must fail closed instead of skipping conflict checks.
drop policy if exists "Create own workspace" on public.workspaces;
drop policy if exists "Update own workspace" on public.workspaces;
revoke all on public.workspaces from public, anon, authenticated;
grant select on public.workspaces to authenticated;

-- Definer privilege is narrowly required because direct table writes are revoked.
-- There is no caller-supplied owner: verified auth.uid() scopes every statement.
create or replace function private.save_workspace(workspace_data jsonb, expected_revision integer)
returns table (revision integer, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise sqlstate 'PT401' using message = 'Sign in required.';
  end if;
  if expected_revision is null or expected_revision < 0 or expected_revision >= 2147483647
     or workspace_data is null or jsonb_typeof(workspace_data) <> 'object'
     or octet_length(workspace_data::text) > 2000000 then
    raise sqlstate 'PT400' using message = 'Invalid workspace save.';
  end if;

  if expected_revision = 0 then
    -- The unique owner key arbitrates simultaneous first saves.
    return query insert into public.workspaces as w (user_id, data, revision, updated_at)
    values (caller, workspace_data, 1, clock_timestamp())
    on conflict (user_id) do nothing
    returning w.revision, w.updated_at;
  else
    -- A single conditional UPDATE is an atomic compare-and-swap. PostgreSQL
    -- rechecks its predicate after waiting for another writer's row lock.
    return query update public.workspaces as w
    set data = workspace_data, revision = w.revision + 1, updated_at = clock_timestamp()
    where w.user_id = caller and w.revision = expected_revision
    returning w.revision, w.updated_at;
  end if;
  if not found then
    raise sqlstate 'PT409' using message = 'Cloud copy changed.';
  end if;
end;
$$;
revoke all on function private.save_workspace(jsonb, integer) from public, anon, authenticated;
grant execute on function private.save_workspace(jsonb, integer) to authenticated;

-- A small invoker wrapper is the only exposed mutation entry point.
create or replace function public.save_workspace(workspace_data jsonb, expected_revision integer)
returns table (revision integer, updated_at timestamptz)
language sql security invoker set search_path = '' as $$
  select * from private.save_workspace(workspace_data, expected_revision);
$$;
revoke all on function public.save_workspace(jsonb, integer) from public, anon, authenticated;
grant execute on function public.save_workspace(jsonb, integer) to authenticated;

commit;
