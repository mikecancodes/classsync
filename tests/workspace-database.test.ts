import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort()
  .map(name => readFileSync(join('supabase/migrations', name), 'utf8'));
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

async function setup(legacy = false) {
  const db = new PGlite();
  // Supabase supplies these roles, users and auth.uid(). The test fixture only
  // supplies the identity plumbing; production SQL and RLS run unmodified.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('${userA}'), ('${userB}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
  `);
  if (legacy) {
    await db.exec(`
      create table public.workspaces (
        user_id uuid primary key references auth.users(id) on delete cascade,
        data jsonb not null check (jsonb_typeof(data) = 'object'),
        updated_at timestamptz not null default now()
      );
      alter table public.workspaces enable row level security;
      create policy "Read own workspace" on public.workspaces for select to authenticated using (auth.uid() = user_id);
      create policy "Create own workspace" on public.workspaces for insert to authenticated with check (auth.uid() = user_id);
      create policy "Update own workspace" on public.workspaces for update to authenticated using (auth.uid() = user_id);
      grant select, insert, update on public.workspaces to authenticated;
      insert into public.workspaces values ('${userA}', '{"original":"keep me"}', '2026-01-01Z');
    `);
  }
  for (const migration of migrations) await db.exec(migration);
  return db;
}

async function asUser(db: PGlite, userId: string, sql: string, params: unknown[] = []) {
  return db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return tx.query<Record<string, unknown>>(sql, params);
  });
}
const save = (db: PGlite, user: string, revision: number | null, data: unknown = { text: 'saved' }) =>
  asUser(db, user, 'select * from public.save_workspace($1::jsonb, $2::integer)', [JSON.stringify(data), revision]);

test('real Postgres migrations preserve legacy data and create a private recovery copy', async () => {
  const db = await setup(true);
  try {
    assert.deepEqual((await asUser(db, userA, 'select data, revision from public.workspaces')).rows,
      [{ data: { original: 'keep me' }, revision: 1 }]);
    assert.deepEqual((await db.query('select data from private.workspace_revision_backups')).rows,
      [{ data: { original: 'keep me' } }]);
    await assert.rejects(asUser(db, userA, 'select * from private.workspace_revision_backups'), code('42501'));
    await assert.rejects(save(db, userA, 0), code('PT409'));
    assert.equal((await save(db, userA, 1)).rows[0].revision, 2);
    // Reapplying the SQL-editor entry point must not reset revisions or recovery data.
    await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
    assert.equal((await asUser(db, userA, 'select revision from public.workspaces')).rows[0].revision, 2);
    assert.deepEqual((await db.query('select data from private.workspace_revision_backups')).rows,
      [{ data: { original: 'keep me' } }]);
  } finally { await db.close(); }
});

test('first-save and same-revision competing attempts have one winner; stale saves preserve data', async () => {
  const db = await setup();
  try {
    // PGlite queues one connection: these verify competing requests and atomic
    // predicates, not independent network connections waiting on row locks.
    const first = await Promise.allSettled([save(db, userA, 0, { winner: 'a' }), save(db, userA, 0, { winner: 'b' })]);
    assert.equal(first.filter(result => result.status === 'fulfilled').length, 1);
    const firstLoser = first.find(result => result.status === 'rejected');
    assert.equal(firstLoser?.status === 'rejected' && firstLoser.reason.code, 'PT409');
    const updates = await Promise.allSettled([save(db, userA, 1, { winner: 'c' }), save(db, userA, 1, { winner: 'd' })]);
    assert.equal(updates.filter(result => result.status === 'fulfilled').length, 1);
    const before = (await asUser(db, userA, 'select * from public.workspaces')).rows;
    await assert.rejects(save(db, userA, 1, { stale: true }), code('PT409'));
    assert.deepEqual((await asUser(db, userA, 'select * from public.workspaces')).rows, before);
    assert.equal(before[0].revision, 2);
    assert.ok(before[0].updated_at);
  } finally { await db.close(); }
});

test('two-user RLS isolation, anonymous denial, direct-write denial and validation', async () => {
  const db = await setup();
  try {
    await save(db, userA, 0, { private: 'a' });
    assert.deepEqual((await asUser(db, userB, 'select * from public.workspaces')).rows, []);
    await save(db, userB, 0, { private: 'b' });
    const own = (await asUser(db, userB, 'select user_id, data from public.workspaces')).rows;
    assert.deepEqual(own, [{ user_id: userB, data: { private: 'b' } }]);
    await assert.rejects(asUser(db, userA, 'update public.workspaces set data = $1::jsonb', ['{}']), code('42501'));
    await assert.rejects(asUser(db, userA, `insert into public.workspaces(user_id,data) values ('${userB}', '{}') on conflict(user_id) do update set data = excluded.data`), code('42501'));
    await assert.rejects(asUser(db, userA, 'delete from public.workspaces'), code('42501'));
    await assert.rejects(save(db, userA, null), code('PT400'));
    await assert.rejects(save(db, userA, -1), code('PT400'));
    await assert.rejects(save(db, userA, 1, []), code('PT400'));
    await assert.rejects(save(db, '', 1), code('PT401'));
    await assert.rejects(db.transaction(async tx => {
      await tx.exec('set local role anon');
      return tx.query("select * from public.save_workspace('{}', 0)");
    }), code('42501'));
    await assert.rejects(db.transaction(async tx => {
      await tx.exec('set local role anon');
      return tx.query('select * from public.workspaces');
    }), code('42501'));
  } finally { await db.close(); }
});
