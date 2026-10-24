# Supabase setup

> **Status: proposal for the live D2L sync phase, not implemented yet.** The current app stores one JSONB workspace per user (`supabase/schema.sql`). See [how this relates to the current app](README.md#how-this-relates-to-the-current-app).

Follow these steps once. Afterwards, the database, logins and security rules are all in place.

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) and click **New project**.
2. Pick a name (`classsync`), a strong database password (save it in a password manager) and the region closest to you.
3. Wait about a minute for the project to start.

## 2. Create the tables

1. In the left sidebar, open **SQL Editor** → **New query**.
2. If you haven't already, run the repo's `supabase/schema.sql` (the current app needs it). Then paste the whole SQL block from [the schema section](#schema-sql) below and click **Run**.
3. Open **Table Editor**. You should see `profiles`, `courses`, `items`, `submissions`, `announcements`, `grades`, `documents` and `sync_runs`.

## 3. Turn on logins

**Authentication → Sign In / Providers**: Email is on by default. Optionally enable Google.

## 4. Get your keys

**Project Settings → API Keys** (or the **Connect** button at the top):

| Key | Where it goes | Secret? |
|---|---|---|
| Project URL (`https://xxxx.supabase.co`) | Dashboard, extension | No |
| Publishable / `anon` key | Dashboard, extension | No. Safe in browser code **because RLS is on** |
| Secret / `service_role` key | Edge Functions only | **Yes.** It bypasses RLS. Never put it in the extension, the dashboard, or git |

Copy `.env.example` to `.env.local` and fill in (the repo's `.gitignore` already ignores `.env*`):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Schema SQL

```sql
-- ============ ClassSync schema v1 ============

-- ---------- types ----------
create type public.item_source as enum ('d2l_api', 'ical', 'manual');
create type public.item_type as enum
  ('assignment', 'quiz', 'discussion', 'event', 'content', 'checklist', 'survey', 'other');
create type public.document_kind as enum ('syllabus', 'file', 'link', 'other');
create type public.sync_source as enum ('extension', 'ical');
create type public.sync_status as enum ('running', 'ok', 'error', 'needs_login');

-- ---------- tables ----------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text,
  d2l_domain      text,
  d2l_user_id     bigint,
  ical_url        text,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.courses (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  d2l_org_unit_id      bigint not null,
  name                 text not null,
  code                 text,
  starts_at            timestamptz,
  ends_at              timestamptz,
  is_active            boolean not null default true,
  home_url             text,
  color                text,
  final_grade_display  text,
  final_grade_points   numeric,
  final_grade_out_of   numeric,
  raw                  jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, d2l_org_unit_id)
);

create table public.items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id          uuid references public.courses (id) on delete cascade,
  source             public.item_source not null,
  external_id        text not null,
  type               public.item_type not null,
  title              text not null,
  instructions_text  text,
  instructions_html  text,
  opens_at           timestamptz,
  due_at             timestamptz,
  closes_at          timestamptz,
  url                text,
  points_possible    numeric,
  completed_at       timestamptz,
  is_exempt          boolean not null default false,
  feedback_text      text,
  feedback_html      text,
  feedback_score     numeric,
  feedback_at        timestamptz,
  dismissed_at       timestamptz,
  raw                jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, source, type, external_id)
);
create index items_user_due_idx on public.items (user_id, due_at);

create table public.submissions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id            uuid not null references public.items (id) on delete cascade,
  d2l_submission_id  bigint not null,
  submitted_at       timestamptz,
  comment            text,
  files              jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, item_id, d2l_submission_id)
);

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  d2l_news_id  bigint not null,
  title        text not null,
  body_text    text,
  body_html    text,
  posted_at    timestamptz,
  attachments  jsonb,
  read_at      timestamptz,
  raw          jsonb,
  search       tsvector generated always as
                 (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body_text, ''))) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, course_id, d2l_news_id)
);
create index announcements_user_posted_idx on public.announcements (user_id, posted_at desc);
create index announcements_search_idx on public.announcements using gin (search);

create table public.grades (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id            uuid not null references public.courses (id) on delete cascade,
  d2l_grade_object_id  bigint not null,
  name                 text not null,
  grade_type           text,
  points_earned        numeric,
  points_possible      numeric,
  displayed_grade      text,
  comments             text,
  raw                  jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, course_id, d2l_grade_object_id)
);

create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  d2l_topic_id    bigint not null,
  title           text not null,
  kind            public.document_kind not null default 'file',
  url             text,
  storage_path    text,
  extracted_text  text,
  search          tsvector generated always as
                    (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(extracted_text, ''))) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, course_id, d2l_topic_id)
);
create index documents_search_idx on public.documents using gin (search);

create table public.sync_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source       public.sync_source not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       public.sync_status not null default 'running',
  error        text,
  counts       jsonb
);
create index sync_runs_user_started_idx on public.sync_runs (user_id, started_at desc);

-- ---------- updated_at, set automatically ----------
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'courses', 'items', 'submissions',
                           'announcements', 'grades', 'documents'] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- a profile row for every new user ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row Level Security: users only see their own rows ----------
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['courses', 'items', 'submissions', 'announcements',
                           'grades', 'documents', 'sync_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I
         for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------- views for the dashboard ----------
-- security_invoker = true makes views obey the RLS rules above
create view public.upcoming_items with (security_invoker = true) as
  select i.*, c.name as course_name, c.code as course_code, c.color as course_color
  from public.items i
  left join public.courses c on c.id = i.course_id
  where i.completed_at is null
    and not i.is_exempt
    and i.dismissed_at is null
    and i.due_at >= now()
  order by i.due_at;

create view public.overdue_items with (security_invoker = true) as
  select i.*, c.name as course_name, c.code as course_code, c.color as course_color
  from public.items i
  left join public.courses c on c.id = i.course_id
  where i.completed_at is null
    and not i.is_exempt
    and i.dismissed_at is null
    and i.due_at < now()
  order by i.due_at;

-- ---------- text search for the chatbot ----------
create function public.search_text(q text, max_results int default 8)
returns table (kind text, id uuid, course_id uuid, title text, snippet text, rank real)
language sql stable set search_path = '' as $$
  with query as (select websearch_to_tsquery('english', q) as tsq)
  select * from (
    select 'announcement'::text, a.id, a.course_id, a.title,
           ts_headline('english', coalesce(a.body_text, ''), query.tsq),
           ts_rank(a.search, query.tsq)
    from public.announcements a, query
    where a.search @@ query.tsq
    union all
    select 'document'::text, d.id, d.course_id, d.title,
           ts_headline('english', coalesce(d.extracted_text, ''), query.tsq),
           ts_rank(d.search, query.tsq)
    from public.documents d, query
    where d.search @@ query.tsq
  ) results (kind, id, course_id, title, snippet, rank)
  order by rank desc
  limit max_results;
$$;
```

### What the tricky parts do

- **`default auth.uid()`** fills in `user_id` with whoever is logged in, so the extension never sends it and can't fake someone else's.
- **`unique (...)`** on D2L IDs is what makes upserts work: running the same sync twice updates rows instead of duplicating them.
- **`security definer`** on `handle_new_user` lets the signup trigger write to `profiles` even though the new user isn't logged in yet. `set search_path = ''` is Supabase's recommended safety setting for functions.
- **`(select auth.uid())`** in policies instead of plain `auth.uid()`: same result, but Postgres computes it once per query instead of once per row.
- **`security_invoker = true`** on views: without it, a view runs with its creator's permissions and skips RLS.
- **`search_text`** is an ordinary function, so RLS applies inside it. Users only search their own announcements and documents.

## 5. Using it from code

In the app, use the existing client from `src/lib/supabase.ts` (it's `null` when the env vars aren't set, i.e. demo mode). The extension creates its own with `createClient(url, anonKey)` from `@supabase/supabase-js`.

### Logging in (dashboard and extension popup)
```js
await supabase.auth.signInWithPassword({ email, password });
```
After that, every query runs as that user and RLS filters automatically.

### Extension: saving a sync
```js
// courses first; .select() hands back our ids so other rows can point at them
const { data: courses } = await supabase
  .from("courses")
  .upsert(d2lCourses.map(toCourseRow), { onConflict: "user_id,d2l_org_unit_id" })
  .select("id, d2l_org_unit_id");

const courseIdByOrgUnit = Object.fromEntries(courses.map(c => [c.d2l_org_unit_id, c.id]));

await supabase
  .from("announcements")
  .upsert(newsRows.map(n => ({ ...n, course_id: courseIdByOrgUnit[n.orgUnitId] })),
          { onConflict: "user_id,course_id,d2l_news_id" });
```
Leave `user_id` out of the rows. The column default fills it in, and RLS rejects any other value. For upserts to match existing rows, `onConflict` must list exactly the columns of that table's `unique (...)` key.

### Dashboard: reading
```js
const { data: due } = await supabase.from("upcoming_items").select("*").limit(20);

const { data: news } = await supabase
  .from("announcements")
  .select("id, title, posted_at, read_at, courses(name, code)")
  .order("posted_at", { ascending: false })
  .limit(10);
```

### Chatbot: searching
```js
const { data } = await supabase.rpc("search_text", { q: "late policy" });
```

## 6. iCal sync (later)

A Supabase **Edge Function** reads each profile's `ical_url`, parses the feed, and upserts rows into `items` with `source = 'ical'`. A scheduled job (**Integrations → Cron**) runs it every 30 minutes. Edge Functions use the secret key and bypass RLS, so the function must set `user_id` itself for every row it writes.

## Checklist before real data goes in

- [ ] RLS is on for every table: **Table Editor** shows no "RLS disabled" warnings, and **Advisors → Security Advisor** is clean
- [ ] Log in as a second test user and confirm you can't see the first user's rows
- [ ] The secret key appears nowhere in the extension, the dashboard, or git
- [ ] `.env.local` is not committed (`git status` should never show it)
