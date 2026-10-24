# Revision-checked cloud saves

## What changed

Cloud storage still holds one JSONB workspace per user and remains manual. Each cloud row now has an integer revision. GET /api/workspace returns { data, revision, updatedAt }; an absent row returns null data, revision 0 and null updatedAt. PUT now requires { data, expectedRevision }. Bare legacy workspace bodies are rejected.

The database save_workspace RPC derives ownership from auth.uid(), performs a single conditional insert/update, returns the new revision and database timestamp, and raises PT409 on a stale revision. The API maps that to HTTP 409. No automatic retry or forced overwrite occurs. Existing rows start at revision 1 without changing their JSON or saved timestamp.

Direct table INSERT/UPDATE/DELETE privileges are revoked from public clients, so old app versions cannot bypass the protocol with upsert. The exposed RPC is an invoker wrapper over a narrowly scoped private definer function; only authenticated users can execute it, and every write uses the verified owner's ID. Browser keys remain public; no new privileged application key is required.

Settings retains local work on conflict and offers the existing export/load actions plus Review and replace cloud with local copy. Replacement first reads the current cloud revision and asks for confirmation showing the cloud course/assignment counts and saved time. It still uses a revision check: another save after review produces another conflict. Cancelling does not load, save or adopt the reviewed revision.

The revision baseline is in memory and belongs to the signed-in user. Sign-out/account changes reset it; results arriving from an earlier account session are ignored. After reloading the browser, load an existing cloud copy or explicitly review its replacement before overwriting it. Local changes remain browser-local; they are not uploaded automatically on sign-in. Chat, coursework schema and backup format remain unchanged.

## Apply to an existing project

1. Export the browser workspace from Settings and take a project backup. Schedule a short pause in cloud saves while deploying the database and app together. Old tabs will need a refresh after deployment.
2. In the intended Supabase project's SQL Editor, run the complete repository supabase/schema.sql. It wraps fresh setup/upgrade in a transaction and is safe to rerun. It preserves current workspaces and creates a one-time private.workspace_revision_backups recovery copy of each row present at upgrade. The private schema must remain outside the Data API exposed schemas.
3. Alternatively, for a CLI-managed project, inspect its migration history first. The migration baseline supports both an empty project and the original workspaces table. Apply both ordered migrations through your established migration workflow; do not apply an SQL-editor upgrade and then invent migration-history repair commands. Reconcile history using the installed CLI's help if needed.
4. Deploy/restart the updated app, then refresh open tabs. If migrations are missing, the API fails closed with a setup error; it never falls back to last-write-wins.
5. Sign in, load an existing cloud workspace and save an edit. In another browser session load the same revision. Save in the first, then save in the second: the second must show a conflict and retain its local work. Try canceling and confirming the replacement review.
6. Verify a second account sees only its own workspace. Check anonymous reads/writes fail and direct old-style upsert is rejected. Confirm email/password login and backup export/restore still work.

Applied to the live ClassSync Supabase project on 2026-10-24 using the complete SQL-editor setup script. Preflight confirmed there was no workspace table, save function, or CLI migration history. The script committed successfully. A rollback-only verification passed first save, revision update, stale-save conflict, account isolation, direct-write denial, anonymous denial, and private-backup denial; no test workspace rows remained. This SQL-editor rollout did not alter CLI migration history.

The ClassSync browser session was signed out during verification. A signed-in browser save/load and the two-browser concurrency check below still need to be exercised; the database checks alone do not establish that complete UI flow.

## Recovery and retention

The upgrade's private backup is an administrator-only migration-time snapshot, not continuous backup or version history. It stores the original JSON and timestamp, cascades on account deletion, and is never served by the app. Use an approved retention period; remove snapshots only after verifying your independent project backups and restore process. Do not expose the backup table through a browser role.

To recover data, an administrator should inspect/export the snapshot and restore the chosen JSON through the current revision-checked save workflow. Do not simply restore an old document over newer work or roll back to the old upsert API. An admin SQL repair must advance the active revision so stale clients remain stale.

## Verification

Run pnpm typecheck, pnpm test, and pnpm build. The test suite includes PGlite (embedded PostgreSQL) tests that execute the production SQL with a minimal Supabase identity fixture. They cover fresh/legacy setup, repeat SQL-editor setup, recovery snapshots, competing first and stale saves, two-user RLS isolation, anonymous denial and direct-write denial. Route/client tests cover auth, payload validation, account-bound baselines, conflict status and fail-closed setup errors.

PGlite uses a single queued database connection. The competing-request tests exercise atomic predicates and stale outcomes, but do not simulate independent Postgres connections waiting on row locks. Repeat the two-browser test against staging before production. Hosted Auth, PostgREST RPC exposure and project advisors also require staging verification; do not infer those from embedded tests.

## References

- [Database functions and grants](https://supabase.com/docs/guides/database/functions)
- [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Migration workflow](https://supabase.com/docs/guides/deployment/database-migrations)
