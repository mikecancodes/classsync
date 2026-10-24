# ClassSync

A responsive academic hub built with Next.js App Router, TypeScript, Tailwind CSS, Supabase, and a server-only OpenAI integration. Start in local demo mode without any credentials.

## Agent development guides

Start with [AGENTS.md](AGENTS.md) and the [team decisions](docs/agents/DECISIONS.md). It links to the [frontend requirements](docs/agents/FRONTEND.md), [architecture and data rules](docs/agents/ARCHITECTURE.md), [development checklist](docs/agents/DEVELOPMENT.md), and [original frontend brief](docs/agents/FRONTEND-BRIEF.md). These guides distinguish the existing MVP from the new frontend targets. The app remains on Next.js and TypeScript; the brief's Vite suggestion is not an automatic migration instruction.

## Run locally

Requires Node.js 20.9+ and pnpm (or npm).

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:3000. The dev server binds to loopback. If using npm, use `npm install` and `npm run dev` instead. This repository includes a pnpm lockfile. Scripts use Webpack because Turbopack's CSS worker failed in the bundled Windows runtime.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

**Mike's Windows/Codex setup only:** pnpm is bundled at `C:/Users/mjstr/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd`. If pnpm cannot create global store links, install with `pnpm install --store-dir .pnpm-store --config.node-linker=hoisted --config.enable-global-virtual-store=false`. You can also start the installed app directly with `node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1`.

## Included MVP

- Top tabs for Home, My Assignments, and Lecture Notes / Material, with the ClassSync logo at the top left. Home centers announcements with class, priority, read status, and sorting controls; deadlines are secondary.
- Course pages with assignment CRUD, completion tracking, earned scores, editable syllabus, and text/Markdown materials.
- Searchable assignment list with status and course filters. All dates are local calendar dates; deadlines are considered overdue on the following day.
- Monthly calendar, responsive navigation, keyboard focus states, and persistent light/dark modes.
- Deterministic weighted grade calculator and hypothetical ungraded-category scenarios. Syllabus extraction supports category/percentage lines and requires review before applying.
- Persistent desktop chat in the right column, with a collapsible mobile panel, current-workspace local answers, and optional server-side AI. Conversation survives page navigation and resets on reload.
- Study assistant: summaries, study guides, catch-up plans, content questions, and rubric-based draft evaluation.
- Local browser persistence, JSON export/restore, optional Supabase email/password auth, explicit cloud save/load, and database RLS.
- Authenticated, validated LMS import preview contract, plus a read-only D2L browser extension prototype in [`extension/`](extension/README.md) that produces its payloads. No import commit or assignment submission yet.

## Local demo behavior

The first visit generates realistic sample coursework with deadlines relative to that visit. Thereafter the version-2 workspace is stored under `classsync-workspace-v2` in localStorage. Legacy v1 data migrates through validation and its original key remains as a recovery copy. Invalid stored data is preserved and automatic writes are paused. Theme is saved separately. Completed status does not imply a score; record earned points explicitly.

**Sync classes** reveals the left-side To-do list with current incomplete coursework, a class filter, and completion controls. Actual class sync is not implemented. Existing data stays in the shared workspace. Due Soon means incomplete work due today through seven local calendar days ahead, inclusive.

The global chatbot answers questions about today, tomorrow, the next seven days, overdue work, and courses using current workspace data. Schedule suggestions are deadline order only; capacity-aware Plan My Week remains future work.

Without an OpenAI key, study tools return labeled excerpts, practice prompts, keyword matches, and a catch-up checklist. They are **not AI-generated answers**. The demo evaluator does not invent a score. Uploads support `.txt`, `.md`, and `.csv` up to 150 KB and 40,000 characters; paste extracted text for PDFs/Word. Raw files are not retained. Material text is stored with the workspace. Rubrics are limited to 20,000 characters.

## Configure OpenAI

Copy `.env.example` to `.env.local`, set `OPENAI_API_KEY`, and optionally set `OPENAI_MODEL` to a model available in your account. Restart the server.

The server uses the [OpenAI Responses API](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create), disables response storage, validates payload size, and limits output. The key is never imported by client code. Course content is sent only when you press a generation button, or explicitly enable connected AI and send a chat question. Chat sends current courses and assignments, with each question handled independently. `GET /api/ai` exposes only configuration availability; it does not bypass authentication. AI output is advisory and all evaluator scores are estimates.

Authenticated Supabase users can call paid AI. For local development without Supabase, set `ALLOW_LOCAL_AI=true`; this bypass only works in development on a loopback hostname. Production always requires an authenticated account. A per-process limit allows 20 AI requests per user per hour. **Before a public multi-instance deployment, replace this with a shared rate limiter and configure provider budgets.** The local bypass is for a trusted local machine, not a public proxy.

## Configure Supabase

1. Create a Supabase project and run `supabase/schema.sql` once in its SQL editor.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. Use only the public/anon key, never the service-role key.
3. Enable email/password authentication. Configure email confirmation and site URL/redirect allowlist for your local or deployed URL.
4. Restart, open Settings, create an account, confirm email if required, then sign in.
5. Use **Save to cloud** to save this browser’s workspace or **Load cloud copy** to replace the local copy after confirmation.

Cloud storage uses one JSONB document per user in PostgreSQL for hackathon simplicity. RLS limits read/write to `auth.uid() = user_id`. API routes validate the bearer token with Supabase Auth. Cloud save is last-write-wins and manual; it is not realtime or automatic multi-device conflict resolution. Local data remains on sign-out and is separate from the signed-in account. Use a private browser session on a shared device.

## Grade math

For each category: `average = sum(earned) / sum(possible)` over rows with an entered score. A blank score is excluded, a zero is included. Current grade is `sum(average × weight) / sum(graded weights) × 100`. Categories with no scores are excluded from the current-grade denominator. Weight zero contributes nothing.

The projection holds existing category averages constant and substitutes the hypothetical percentage for categories with no grades. It is disabled unless weights total 100%. It does not forecast individual future assignments within partially graded categories. Edit and clear an assignment’s earned points to explore those changes. Letter bands are the demo defaults (A ≥90, B ≥80, C ≥70, D ≥60).

## API and structure

```text
src/app/layout.tsx           Persistent application shell
src/app/[[...slug]]/page.tsx   Catch-all route entry
src/components/class-sync.tsx Dashboard, navigation, coursework, calendar
src/components/panels.tsx     Assistant, grades, materials, settings
src/lib/model.ts             Domain types, validation, deterministic math
tests/fixtures.ts            Synthetic test data (the app itself starts empty)
src/lib/workspace.ts         v1 migration and demo fixture merge helper
src/lib/academic-assistant.ts Deterministic local chatbot and date windows
src/lib/feed.ts               Pure announcement filtering and sorting
src/components/notes-page.tsx Global course-linked materials workspace
src/components/chatbot.tsx   Global collapsible chat panel
src/lib/server.ts            Authentication, body limits, rate limiter
src/app/api/ai/route.ts       Server-only generation and demo tools
src/app/api/workspace/route.ts Authenticated GET / PUT workspace
src/app/api/imports/preview/route.ts Future LMS validation contract
supabase/schema.sql          PostgreSQL table and row-level policies
tests/grades.test.ts          Grade and validation regression tests
tests/frontend.test.ts        Migration, sync, dates, and chatbot tests
tests/feed.test.ts            Combined announcement filters and sorting
```

`POST /api/imports/preview` requires a Supabase bearer token and accepts `{ "version": 1, "source": "canvas" | "d2l" | "manual", "data": { "courses": [], "assignments": [], "materials": [] } }`, using the full domain schemas in `src/lib/model.ts`. The outer import contract remains version 1; its nested workspace accepts legacy data or version 2 with announcements and normalizes to version 2. It validates uniqueness and references and returns a normalized preview plus counts and `requiresApproval: true`. It never writes data. A future extension must add an origin/permission policy, student preview/approval UI, deduplication, and a transactional import commit endpoint. The current workspace PUT is for explicit full-workspace saves, not automatic LMS ingestion.

## MVP boundaries

The app starts with an empty workspace; no sample data is seeded. Course creation, advanced calendar events, PDF/DOCX extraction, streaming AI output, production-wide quotas, conflict resolution, and LMS import commit are future work. Supabase and live OpenAI require your credentials and have not been exercised against an account by default. No secrets belong in Git; `.env*` is ignored except `.env.example`.
