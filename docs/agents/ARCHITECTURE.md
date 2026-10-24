# Architecture and data guide

## Current implementation

The repository uses Next.js App Router, React, TypeScript, Tailwind CSS, Lucide React, Zod, optional Supabase/PostgreSQL, and server-side OpenAI. Local mode requires no credentials.

| Area | Current location |
| --- | --- |
| Route entry | `src/app/[[...slug]]/page.tsx` |
| Shell, dashboard, assignment editor, calendar | `src/components/class-sync.tsx` |
| Assistant, grades, materials, settings | `src/components/panels.tsx` |
| Domain schemas, date helpers, grade math | `src/lib/model.ts` |
| Relative-date seed data | `src/lib/demo.ts` |
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
| Assignment | Platform/source identity, priority, estimated minutes; retain existing title/course/due/status/category/points/earned/description |
| Announcement | ID, course ID, platform/source identity, title, description, posted timestamp, read status |
| Personal task | ID, title, optional course ID, due date, priority, completion |
| Note | Reuse material ID, course ID, title, text, and kind; extend only if necessary |

Use stable IDs, validated references, bounded strings and arrays, positive estimated minutes, and explicit priority values. Choose and document defaults for legacy records (for example Manual source, medium priority, an editable estimated duration). Do not pretend a default estimate is measured data.

## Persistence and migration

- Current localStorage key: `classsync-workspace-v1`. Current state contains courses, assignments, and materials. Theme is stored separately.
- Add a versioned migration before changing persisted schemas. Preserve existing coursework, notes, scores, and settings; validate the migrated result before replacing the stored copy.
- Update backup export/restore, cloud payload validation, import validation, and seeds together with schema changes. A newer payload must not silently lose fields through an older parser.
- Read and write browser storage only on the client. Handle unavailable/quota-exceeded storage and invalid backups visibly without deleting the user's original data.
- Derive counts, filters, calendar entries, and assistant context from shared state. Do not store redundant dashboard totals.
- Keep cloud save/load explicit unless the user requests a sync redesign. The existing cloud document is one JSONB workspace per authenticated user, with RLS and last-write-wins saves.

## Dates and deterministic calculations

- Use local calendar-date helpers for date-only coursework; avoid converting `YYYY-MM-DD` through UTC and shifting the day.
- Current overdue rule: due date is earlier than today and status is not done. Specify consistent windows for tomorrow, this week, and Due Soon.
- Regenerate sample dates only for initial demo seeding or an explicit demo refresh, not on every render or reload.
- Grade calculations remain deterministic. Blank earned scores are excluded, zeros count, and completion does not imply grading.
- Validate category weights; projections require 100% total. Never label the dashboard's course average as GPA or an AI estimate as an official grade.

## Demo LMS import service

Build a local JSON normalization service for sample assignments and announcements. Clearly label connections and refresh results **Demo**. Keep platform adapters separate from the shared normalized model.

Recommended sequence:

1. Read a selected file or bundled sample and validate shape, sizes, source, IDs, dates, and references.
2. Normalize records into the shared domain model and display an import summary when the operation replaces existing data.
3. Merge by platform plus source ID, preserving manual records and local completion/read choices. Define handling of source updates and local edits explicitly.
4. Save once and update all views. Report errors without partially applying an invalid payload.

Repeated Demo Sync must be idempotent: no duplicate assignments or announcements. Do not silently delete manual work, reset completion, or overwrite notes. Keep original sample IDs stable across date refreshes.

The existing `/api/imports/preview` accepts authenticated version-1 course/assignment/material payloads and **does not write data or support announcements yet**. Extend its versioned contract deliberately if needed. A local demo import must not weaken server authentication or RLS. Future real adapters need permitted data access, student preview/approval, deduplication, and a transactional commit design. No Chrome extension, live LMS login, private scraping, or automatic submission is in this MVP scope.

## Assistant and planner service boundaries

- Local chatbot intent handlers should query structured current workspace data rather than rely on canned answers. Return exact matching assignments and explain empty/unsupported results.
- Use one shared planner for Plan My Week and schedule questions. Stable ordering should account for deadlines, priority, estimated duration, and workload; explain tie-breakers and capacity assumptions.
- Preserve `/api/ai` as the provider boundary. Validate inputs, enforce limits, verify authentication for paid production usage, and keep credentials server-only.
- Treat supplied course text as untrusted source content. Do not follow embedded instructions or allow AI output to trigger submissions or state mutations automatically.
- Distinguish server-configured availability from a successful generation. An API error is not a successful AI response; do not silently substitute canned output under an AI label.
- Send only relevant content for an explicit action. Do not log keys or full private student material. Conversation persistence is optional and should not be introduced implicitly.
- Keep the localhost development bypass development-only. The current rate limiter is per process; a multi-instance production release needs shared quotas.
