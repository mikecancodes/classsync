# ClassSync Website Logic

This file captures the product behavior for the ClassSync hackathon demo. It complements the repository's agent guides and [team decisions](../agents/DECISIONS.md); it does not replace the existing Next.js, TypeScript, shared-workspace, or server-route architecture. Keep the demo functional without credentials, and label simulated LMS data and rule-based assistance honestly.

## Shared workspace and data

Use one shared workspace as the source of truth so that completing or editing work updates the Home dashboard, assignment list, classes, calendar, and chatbot together.

- **Courses:** stable ID, name, optional instructor, platform (stored as `d2l`, `canvas` or `manual`; shown as D2L, Canvas, Manual), and display color.
- **Assignments:** stable ID, title, course ID, source/platform, local due date, optional due time, priority, estimated minutes, description, completion state, and existing grade fields (points optional). Completion must not create a grade.
- **Announcements:** stable ID, course ID, source/platform, title, summary, posted date, and read state.
- **Materials/notes:** reuse the existing course-linked material records for lecture notes. Support title, text, course association, and update time; do not create a duplicate notes store.
- **Personal tasks:** stable ID, title, optional course, optional due date, priority, and completion state. Keep these distinct from graded assignments.
- **Chat messages:** session state only unless conversation persistence is explicitly added later.

The current workspace is stored under `classsync-workspace-v2` and contains courses, assignments, materials, and announcements (v1 data migrates automatically; its original storage key remains as a recovery copy). Extend it through a validated, versioned migration before adding persisted fields or entities. Preserve existing notes, grades, coursework, and settings. Keep theme storage separate. Use local calendar dates for coursework; avoid parsing `YYYY-MM-DD` as UTC and shifting the displayed day.

## Data and sync

The app starts with an empty workspace and seeds no sample data ([decision 12](../agents/DECISIONS.md)). Sample courses such as Computer Networks or Data Structures may appear only in test fixtures under `tests/`.

Load and normalize fixture JSON through a small service boundary into the shared workspace model. The interface must label every simulated connection and refresh result **Demo**. The current Sync classes button only opens a To-do list. Future fixture-import refreshes must be idempotent: merge by stable source identity, create no duplicates, preserve manual records and local completion/read choices, and avoid silently replacing the user's saved workspace. Report invalid data without partially applying it.

Live Brightspace (D2L) data comes from the read-only browser extension prototype in `extension/` (see `docs/d2l-sync/extension.md`), which uses the student's own signed-in session and sends data only through the authenticated import preview endpoint. Official OAuth access for Canvas and Brightspace remains future work requiring institution-approved app registration. Do not ask for LMS passwords, bypass authentication, submit work automatically, or put LMS/API secrets in frontend code. Keep platform adapters separate from UI and server routes.

## Approved dashboard layout

The latest user correction supersedes earlier dashboard layouts: place the ClassSync brain logo at the top left, top tabs for Home / My Assignments / Lecture Notes / Material, announcements in the center with class, priority, read-state filters and sorting, and a persistent chat column on the right. Mobile keeps top navigation and opens chat as a collapsible panel. Secondary tools live under More. Do not restore a desktop left sidebar or hide announcements behind a disclosure.

## Home dashboard

Derive all counts from current shared state:

- **Total Assignments:** all assignments, including completed ones.
- **Due Soon:** incomplete assignments due from today through the next seven local calendar days.
- **Completed Assignments:** assignments marked complete.

Show announcements newest first with course, platform, title, short description, posted date, and read/unread state. Opening an announcement marks it read. Show upcoming incomplete assignments in deadline order and make overdue work visible separately. Search matches assignment and announcement titles plus course names. Sync classes opens the To-do list dialog; real syncing is deferred.

An assignment is overdue when its local due date is earlier than today and it is not complete. Use the same definition in the dashboard, filters, calendar, planner, and chatbot.

## Assignments

Show assignment name, course, LMS platform (or Manual), due date, priority, completion state, estimated time, and description. Default to nearest due date with a stable tie-breaker. Course, due-date, platform, priority, and completion filters combine with AND logic; provide a reset-to-All action and a useful empty state.

Allow users to add, edit, delete, and complete assignments. Updates must immediately affect all derived views. Preserve existing earned points and categories; completion never implies a score. Do not let a future LMS refresh silently overwrite local edits.

## Lecture notes and tasks

Notes use the existing materials workspace. Users can create, edit, delete, course-link, view, and search note titles and text. The AI Summary action may call the configured server-side AI route; without a working service, explain that AI is unavailable or provide a separately labeled local excerpt. Never label a local result as AI-generated.

Personal tasks support add, completion, optional course and due date, priority, and delete. Group them into **Today**, **Upcoming**, and **Completed**, with overdue tasks visibly identified so past work never disappears. Persist task changes in the migrated shared workspace. Progress is completed tasks divided by all tasks; display zero safely when there are no tasks.

## Calendar and classes

Build calendar events from assignments and personal tasks, and include quizzes/exams when represented by assignment type. Use course colors plus text labels; use a neutral style for tasks without a course. Month view is required; week view is optional. Selecting an event shows its details and correct local date.

The classes page derives assignment totals and upcoming deadlines from shared state. Selecting a class shows only its associated assignments and materials/notes. Preserve existing course detail, syllabus, and grade workflows.

## Global local assistant

Mount one persistent desktop left-side chat panel across pages; collapse it only on mobile. It reads the current shared workspace, including edits made after the panel was opened. In demo mode label it **Local assistant / rule-based** and do not send student data externally.

Support deterministic local answers for:

- Due today, tomorrow, or this week: list incomplete assignments in the requested local date range.
- Missing/overdue: explain that the demo interprets “missing” as overdue and incomplete, then list those assignments.
- By course: match the course and list its incomplete assignments by due date; clarify ambiguous course matches.
- What should I work on / help plan my week: use the same study-planning service as Plan My Week and explain the reasons.

If there are no matches, say so. For unsupported questions, explain the local assistant's limits instead of inventing facts. With a configured AI service, use the existing authenticated server endpoint; keep provider credentials server-only and surface service errors honestly.

## Plan My Week

Plan only from incomplete assignments. Use a deterministic order based on deadline, priority, estimated minutes, and remaining workload; explain tie-breaks and any available-time assumptions. Group suggestions by day before each deadline, put undated items in an Unscheduled group, and surface overdue work or overload instead of promising everything fits. The plan is advisory and must never change due dates, completion, grades, or submissions.

## Code boundaries

Preserve the existing Next.js App Router, React, TypeScript, Tailwind, Lucide, Supabase, and API-route structure. Use focused components and pure TypeScript services rather than adding a second router or duplicate storage layer. Existing core locations include:

- `src/app/[[...slug]]/page.tsx`: route entry.
- `src/components/class-sync.tsx` and `src/components/panels.tsx`: current application UI.
- `src/lib/model.ts`: domain types, validation, date helpers, and grade logic.
- `src/lib/workspace.ts`: empty workspace and migrations (no seed data).
- `src/app/api/ai/route.ts`: server-side AI boundary.
- `src/app/api/imports/preview/route.ts`: authenticated, preview-only LMS contract.

Extract reusable UI and pure services incrementally. Keep import normalization, storage migration, chatbot intent matching, and study planning out of page rendering code. Update the relevant architecture and frontend guides when implementation contracts change.
