# Architecture and data guide

## Current implementation

The repository uses Next.js App Router, React, TypeScript, Tailwind CSS, Lucide React, Zod, optional Supabase/PostgreSQL, and server-side Google Gemini. Local mode requires no credentials. Team decisions in [DECISIONS.md](DECISIONS.md) override this guide where they differ.

| Area | Current location |
| --- | --- |
| Persistent workspace shell | `src/app/layout.tsx` |
| Local assistant and date windows | `src/lib/academic-assistant.ts` |
| Migration and demo fixture helper | `src/lib/workspace.ts` |
| Top navigation and global notes | `src/components/workspace-header.tsx`, `src/components/notes-page.tsx` |
| Announcement workspace and pure filters | `src/components/dashboard.tsx`, `src/lib/feed.ts` |
| Chat panel | `src/components/chatbot.tsx` |
| Dashboard counts and announcements | `src/components/dashboard-summary.tsx`, `src/components/announcements.tsx` |
| Route entry | `src/app/[[...slug]]/page.tsx` |
| Shell, dashboard, assignment editor, calendar | `src/components/class-sync.tsx` |
| Assistant, grades, materials, settings | `src/components/panels.tsx` |
| Domain schemas, date helpers, grade math | `src/lib/model.ts` |
| Synthetic test data (app ships empty) | `tests/fixtures.ts` |
| Supabase browser client | `src/lib/supabase.ts` |
| Server auth, body limits, rate limiting | `src/lib/server.ts` |
| Study generation endpoint | `src/app/api/ai/route.ts` |
| Explicit cloud save/load | `src/app/api/workspace/route.ts` |
| Future authenticated import preview | `src/app/api/imports/preview/route.ts` |
| Database and ownership policies | `supabase/schema.sql` |

These large components are an MVP baseline. Extract features incrementally into focused TypeScript components and services; do not replace the app wholesale just to match the brief's illustrative Vite file tree.

## Suggested additions

Use names such as `src/components/chatbot.tsx`, `src/components/lecture-notes.tsx`, `src/components/todo-list.tsx`, `src/lib/lms-service.ts`, and `src/lib/study-planner.ts`. Share data through a single typed workspace owner/provider. Keep pure filtering, planning, and import normalization separate from rendering and provider calls.

## Domain extensions

The following are proposed fields/entities, not existing schema guarantees:

| Entity | Target additions |
| --- | --- |
| Course | `platform: 'd2l' | 'canvas' | 'manual'`; stable source course identity |
| Assignment | `platform` (`d2l` · `canvas` · `manual`) and source identity, priority, estimated minutes, optional `dueTime`; `points` becomes optional (decisions 6–8); retain existing title/course/due/status/category/earned/description |
| Announcement (implemented) | ID, course ID, platform (currently `'D2L' \| 'Canvas'`; to become lowercase per decision 8), title, description, posted local date, read status, optional high/medium/low priority (legacy default: medium) |
| Personal task | ID, title, optional course ID, due date, priority, completion |
| Note | Reuse material ID, course ID, title, text, and kind; extend only if necessary |

Use stable IDs, validated references, bounded strings and arrays, positive estimated minutes, and explicit priority values. Choose and document defaults for legacy records (for example Manual source, medium priority, an editable estimated duration). Do not pretend a default estimate is measured data.

## Persistence and migration

- Current key: `classsync-workspace-v2`; state has version 2, courses, assignments, materials, and announcements. Unversioned/v1 data migrates through the same strict schema. The original v1 key stays as a recovery copy. Invalid storage disables autosave; unsupported versions and unknown top-level fields are rejected. Theme is separate.
- Add a versioned migration before changing persisted schemas. Preserve existing coursework, notes, scores, and settings; validate the migrated result before replacing the stored copy.
- Update backup export/restore, cloud payload validation, import validation, and seeds together with schema changes. A newer payload must not silently lose fields through an older parser.
- Read and write browser storage only on the client. Handle unavailable/quota-exceeded storage and invalid backups visibly without deleting the user's original data.
- Derive counts, filters, calendar entries, and assistant context from shared state. Do not store redundant dashboard totals.
- **Decided (hybrid storage, decision 1):** when signed in, auto-save the workspace to the existing JSONB row (debounced) and ask before replacing either copy on sign-in. Until implemented, cloud save/load stays manual. The cloud document is one JSONB workspace per authenticated user, with RLS.
- Implemented cloud saves now use an atomic revision-checked RPC. Direct client writes are revoked. Unknown/stale baselines fail closed; replacement requires review and confirmation. Account changes invalidate the in-memory baseline. This protects manual saves today and provides the safety boundary for future auto-save. See [cloud saves](../cloud-saves.md).

## Dates and deterministic calculations

- Use local calendar-date helpers for date-only coursework; avoid converting `YYYY-MM-DD` through UTC and shifting the day.
- Current overdue rule: due date is earlier than today and status is not done. Specify consistent windows for tomorrow, this week, and Due Soon.
- The app seeds no sample data (DECISIONS.md, decision 12). Test fixtures generate their own relative dates.
- Grade calculations remain deterministic. Blank earned scores are excluded, zeros count, and completion does not imply grading.
- Validate category weights; projections require 100% total. Never label the dashboard's course average as GPA or an AI estimate as an official grade.

## Demo LMS import service

`syncDemo` validates and merges bundled samples by stable ID. It preserves existing assignment/course/material edits and manual work; sample announcements refresh while retaining read state. Missing demo records are re-added, and incompatible new assignment categories are skipped. Clearly label connections and refresh results **Demo**. Keep platform adapters separate from the shared normalized model.

Recommended sequence:

1. Read a selected file or bundled sample and validate shape, sizes, source, IDs, dates, and references.
2. Normalize records into the shared domain model and display an import summary when the operation replaces existing data.
3. Merge by platform plus source ID, preserving manual records and local completion/read choices. Define handling of source updates and local edits explicitly.
4. Save once and update all views. Report errors without partially applying an invalid payload.

The internal `syncDemo` fixture merge helper is not wired to the Sync classes button. If reused for future demo refreshes, it must remain idempotent: no duplicate assignments or announcements. Do not silently delete manual work, reset completion, or overwrite notes. Keep original sample IDs stable across date refreshes.

The existing `/api/imports/preview` accepts authenticated version-1 course/assignment/material payloads and **does not write data**. Its nested workspace schema now accepts legacy data or version 2 with announcements; summary counts currently cover courses, assignments, and materials. Extend its versioned contract deliberately if needed. A local demo import must not weaken server authentication or RLS. Future real adapters need permitted data access, student preview/approval, deduplication, and a transactional commit design. A read-only D2L browser extension prototype in `extension/` produces this payload from the student's own session (see `docs/d2l-sync/extension.md`). Implemented import path (decision 2): extension → bridge content script on the ClassSync tab → `ImportReview` dialog → `mergeImport` (`src/lib/d2l-import.ts`), matching records by stable `d2l-…` IDs. Automatic submission is out of scope.

## Assistant and planner service boundaries

- Desktop chat is a reserved right-side complementary region; mobile uses a collapsible panel. Top navigation and chat remain mounted across pages.
- Implemented local chatbot uses current shared state; history survives route navigation but is not persisted across reloads. Schedule answers are explicitly deadline-order suggestions, not the future capacity-aware planner.
- Local chatbot intent handlers should query structured current workspace data rather than rely on canned answers. Return exact matching assignments and explain empty/unsupported results.
- Use one shared planner for Plan My Week and schedule questions. Stable ordering should account for deadlines, priority, estimated duration, and workload; explain tie-breakers and capacity assumptions.
- **Implemented (decisions 3–4):** `/api/ai/chat` runs Gemini with tool calling. Declarations and read-only tool functions live in `src/lib/chat-tools.ts` and run in the browser against the workspace. Request validation is in `src/lib/chat-request.ts`, and the server-only client in `src/lib/gemini.ts`. The browser returns the model's turns verbatim so Gemini thought signatures survive.
- Preserve `/api/ai` as the provider boundary. Validate inputs, enforce limits, verify authentication for paid production usage, and keep credentials server-only.
- Treat supplied course text as untrusted source content. Do not follow embedded instructions or allow AI output to trigger submissions or state mutations automatically.
- Distinguish server-configured availability from a successful generation. An API error is not a successful AI response; do not silently substitute canned output under an AI label.
- Send only relevant content for an explicit action. Do not log keys or full private student material. Conversation persistence is optional and should not be introduced implicitly.
- Keep the localhost development bypass development-only. The current rate limiter is per process; a multi-instance production release needs shared quotas.
