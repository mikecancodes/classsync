# ClassSync

A responsive academic hub built with Next.js App Router, TypeScript, Tailwind CSS, Supabase, and a server-only Google Gemini integration. Start in local demo mode without any credentials.

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
- Grades page (`/grades`) with a card per class, and a per-class calculator (`/grades/<class>`, also the class's Grades tab): category weights and averages, scores, points and categories editable in place, what-if mode with hypothetical items, a target-grade solver ("average X% on the remaining work"), and weights from syllabus text. D2L syncs fill in scores and weights.
- Persistent desktop chat in the right column, with a collapsible mobile panel, current-workspace local answers, and optional server-side AI. Conversation survives page navigation and resets on reload.
- Study assistant: summaries, study guides, catch-up plans, content questions, and rubric-based draft evaluation.
- Local browser persistence, JSON export/restore, optional Supabase email/password auth, explicit cloud save/load, and database RLS.
- Authenticated, validated LMS import preview contract, plus a read-only D2L browser extension ([`extension/`](extension/README.md)) with a guided **Connect your school** page, import review and idempotent merge into the local workspace. No assignment submission.

## Local demo behavior

The first visit generates realistic sample coursework with deadlines relative to that visit. Thereafter the version-3 workspace is stored under `classsync-workspace-v3` in localStorage. Legacy v1 data migrates through validation and its original key remains as a recovery copy. Invalid stored data is preserved and automatic writes are paused. Theme is saved separately. Completed status does not imply a score; record earned points explicitly.

**Sync classes** reveals the left-side To-do list with current incomplete coursework, a class filter, and completion controls. Actual class sync is not implemented. Existing data stays in the shared workspace. Due Soon means incomplete work due today through seven local calendar days ahead, inclusive.

The global chatbot answers questions about today, tomorrow, the next seven days, overdue work, and courses using current workspace data. With Gemini configured and a signed-in account, it switches to AI chat that looks up assignments, announcements, grades, and notes through read-only tools; otherwise it answers locally with rules. Schedule suggestions are deadline order only; capacity-aware Plan My Week remains future work.

Without a Gemini key, study tools return labeled excerpts, practice prompts, keyword matches, and a catch-up checklist. They are **not AI-generated answers**. The demo evaluator does not invent a score. Study assistant text uploads support `.txt`, `.md`, and `.csv` up to 150 KB and 40,000 characters; paste extracted text for PDFs/Word. Raw files are not retained. Material text is stored with the workspace. Rubrics are limited to 20,000 characters.

## Connect your school (D2L)

Students open **Sync classes → Connect your school** (`/connect`): download the ClassSync extension, load it in Chrome/Edge/Brave, pick their school (University of North Georgia is listed; any other school pastes a D2L link), and sign in to D2L as usual. Their classes, assignments, announcements, grades (with D2L's category weights) and dates found in each class syllabus appear in a review dialog and are merged only after they approve. Any class's Syllabus tab can also scan an uploaded or pasted syllabus for due dates (Gemini when configured, otherwise a basic date finder). Later syncs add only what changed and keep local completion, scores and read state. The extension zip is built by `scripts/pack-extension.mjs` during `pnpm dev`/`pnpm build`; CI and Vercel builds point it at the live site, https://classsync-two.vercel.app (override with `CLASSSYNC_SITE_URL`). Details: [docs/d2l-sync/extension.md](docs/d2l-sync/extension.md).

## Configure Gemini

ClassSync uses Google Gemini because MLH provides free credits to hackathon participants. Create a Free Tier key in Google AI Studio, copy `.env.example` to `.env.local`, set `GEMINI_API_KEY`, and restart the server. The app pins `gemini-3.5-flash-lite`, which Google lists with free-tier token pricing. Keep billing disabled on the Google Cloud project; requests stop at the free quota instead of switching to paid usage.

**Chat** (`POST /api/ai/chat`) uses tool calling. Gemini asks for specific data, the browser runs the lookup (`src/lib/chat-tools.ts`) against the local workspace, and only those rows are sent back. Tools are read-only. The server is stateless, allows at most five lookups per question, and counts every round trip toward a limit of 120 per user per hour. **Study tools** (`POST /api/ai`) send the material you choose when you press a generation button. The key is never imported by client code. `GET /api/ai` exposes only configuration availability. AI output is advisory and all evaluator scores are estimates.

Authenticated Supabase users can call paid AI. For local development without Supabase, set `ALLOW_LOCAL_AI=true`; this bypass only works in development on a loopback hostname. Production always requires an authenticated account. Per-process limits allow 20 study-tool requests and 120 chat round trips per user per hour. **Before a public multi-instance deployment, replace this with a shared rate limiter and configure provider budgets.** The local bypass is for a trusted local machine, not a public proxy.

## School calendar subscription

Paste a school `.ics` subscription link on the existing Calendar page and press **Sync**. The school-calendar link is only shown on the Calendar page. School events appear on the existing Calendar page alongside assignments. The link stays in this browser and is excluded from exports/cloud saves; cached events are saved with the workspace. Refresh is manual. See [calendar behavior and limits](docs/school-calendar.md).

## Configure Supabase

1. Create a Supabase project and run the complete `supabase/schema.sql` in its SQL editor. Existing installations must also run the updated script before using this app version; see [cloud-save rollout](docs/cloud-saves.md).
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. Use only the public/anon key, never the service-role key.
3. Enable email/password authentication. Configure email confirmation and site URL/redirect allowlist for your local or deployed URL.
4. Restart, open Settings, create an account, confirm email if required, then sign in.
5. Use **Save to cloud** to save this browser’s workspace or **Load cloud copy** to replace the local copy after confirmation.

Cloud storage uses one JSONB document per user in PostgreSQL for hackathon simplicity. RLS limits read/write to `auth.uid() = user_id`. API routes validate the bearer token with Supabase Auth. Cloud save is manual and revision-checked: a stale save returns a conflict and preserves local work. Settings offers export, load, or an explicit review-and-replace action that is checked again at commit. A new browser session must load or review an existing cloud copy before replacing it. It is not realtime or an automatic merge. See [rollout and recovery](docs/cloud-saves.md). Local data remains on sign-out and is separate from the signed-in account. Use a private browser session on a shared device.

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
src/app/api/workspace/route.ts Authenticated revision-checked GET / PUT workspace
src/app/api/imports/preview/route.ts Future LMS validation contract
supabase/schema.sql          Transactional SQL-editor setup/upgrade
supabase/migrations/         Versioned baseline and revision-save migration
tests/grades.test.ts          Grade and validation regression tests
tests/frontend.test.ts        Migration, sync, dates, and chatbot tests
tests/feed.test.ts            Combined announcement filters and sorting
```

`POST /api/imports/preview` requires a Supabase bearer token and accepts `{ "version": 1, "source": "canvas" | "d2l" | "manual", "data": { "courses": [], "assignments": [], "materials": [] } }`, using the full domain schemas in `src/lib/model.ts`. The outer import contract remains version 1; its nested workspace accepts legacy data or version 2 with announcements and normalizes to version 2. It validates uniqueness and references and returns a normalized preview plus counts and `requiresApproval: true`. It never writes data. The D2L extension does not use this endpoint: it hands imports to the open ClassSync tab, where the student approves them and `mergeImport` (`src/lib/d2l-import.ts`) deduplicates by stable ID. The current workspace PUT is for explicit full-workspace saves, not automatic LMS ingestion.

## MVP boundaries

The app starts with an empty workspace; no sample data is seeded. Course creation, advanced calendar events, PDF/DOCX extraction, streaming AI output, production-wide quotas, conflict resolution, and Canvas import are future work. Supabase and live Gemini require your credentials and have not been exercised against an account by default. No secrets belong in Git; `.env*` is ignored except `.env.example`.

Notes and material attachments: upload PDF, Word (.doc/.docx), or PNG/JPG/WebP/GIF images up to 10 MB through the Notes / Material page or a course's materials tab. Files persist in IndexedDB in the current browser, with image previews and downloads. Cloud saves and workspace JSON backups contain text notes only; attached files must be downloaded separately. Uploads do not extract document text or perform OCR.


## Production AI setup on free tiers

Set `GEMINI_API_KEY` as a server-only Production secret in Vercel. Keep the Google project on Free tier with billing disabled. Hosted AI also requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from a Supabase Free project, with email/password sign-in configured; never use a service-role key in frontend configuration. Add `https://classsync-two.vercel.app` as the Supabase Auth site URL.

After changing environment variables, deploy current `main` using `.github/workflows/deploy-vercel.yml` (Actions > Deploy to Vercel Production > Run workflow). Vercel Hobby requires the deployment commit author to have project access; a blocked deployment does not activate new environment settings. Preserve teammates’ changes when preparing an authorized deployment commit.

Verify Vercel reports Ready and `/api/ai` reports `available: true`. This endpoint only confirms configuration, not a successful model response. Sign in to ClassSync and test an AI question before calling the chatbot operational. Free quota exhaustion must show an error without enabling billing or changing to paid usage.
