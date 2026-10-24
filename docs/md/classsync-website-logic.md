# ClassSync Website Logic

This file captures the product behavior for the ClassSync hackathon demo. It complements the repository's agent guides; it does not replace the existing Next.js, TypeScript, shared-workspace, or server-route architecture. Keep the demo functional without credentials, and label simulated LMS data and rule-based assistance honestly.

## Shared workspace and data

Use one shared workspace as the source of truth so that completing or editing work updates the Home dashboard, assignment list, classes, calendar, and chatbot together.

- **Courses:** stable ID, name, optional instructor, platform (`D2L`, `Canvas`, or `Manual`), and display color.
- **Assignments:** stable ID, title, course ID, source/platform, local due date, priority, estimated minutes, description, completion state, and existing grade fields. Completion must not create a grade.
- **Announcements:** stable ID, course ID, source/platform, title, summary, posted date, and read state.
- **Materials/notes:** reuse the existing course-linked material records for lecture notes. Support title, text, course association, and update time; do not create a duplicate notes store.
- **Personal tasks:** stable ID, title, optional course, optional due date, priority, and completion state. Keep these distinct from graded assignments.
- **Chat messages:** session state only unless conversation persistence is explicitly added later.

The current workspace is stored under `classsync-workspace-v1` and already contains courses, assignments, and materials. Extend it through a validated, versioned migration before adding persisted fields or entities. Preserve existing notes, grades, coursework, and settings. Keep theme storage separate. Use local calendar dates for coursework; avoid parsing `YYYY-MM-DD` as UTC and shifting the displayed day.

## Demo data and sync

Seed realistic Computer Networks, Data Structures, Criminal Justice, Computer Architecture, and Algorithm Analysis courses, with assignments such as Socket Programming Lab, Priority Queue Assignment, Chapter 5 Quiz, Cache Memory Discussion, and Algorithm Analysis Homework. Include multiple announcements and course-linked notes. Generate dates relative to the current date only on first seed or explicit demo refresh, not on each render.

Load and normalize fixture JSON through a small service boundary into the shared workspace model. The interface must label every simulated connection and refresh result **Demo**. Repeated Demo Sync must be idempotent: merge by stable source identity, create no duplicates, preserve manual records and local completion/read choices, and avoid silently replacing the user's saved workspace. Report invalid data without partially applying it.

Real Canvas and Brightspace support is future work requiring institution-approved app registration and student authorization. Do not scrape private accounts, ask for LMS passwords, bypass authentication, or put LMS/API secrets in frontend code. Keep platform adapters separate from UI and server routes.

## Home dashboard

Derive all counts from current shared state:

- **Total Assignments:** all assignments, including completed ones.
- **Due Soon:** incomplete assignments due from today through the next seven local calendar days.
- **Completed Assignments:** assignments marked complete.

Show announcements newest first with course, platform, title, short description, posted date, and read/unread state. Opening an announcement marks it read. Show upcoming incomplete assignments in deadline order and make overdue work visible separately. Search matches assignment and announcement titles plus course names. Demo Sync refreshes fixture data and reports success or failure.

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

Mount one collapsible chat panel across pages. It reads the current shared workspace, including edits made after the panel was opened. In demo mode label it **Local assistant / rule-based** and do not send student data externally.

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
- `src/lib/demo.ts`: relative-date demo seed.
- `src/app/api/ai/route.ts`: server-side AI boundary.
- `src/app/api/imports/preview/route.ts`: authenticated, preview-only LMS contract.

Extract reusable UI and pure services incrementally. Keep import normalization, storage migration, chatbot intent matching, and study planning out of page rendering code. Update the relevant architecture and frontend guides when implementation contracts change.
