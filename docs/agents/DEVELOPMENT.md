# Development workflow and acceptance checks

## Before implementation

1. Read root AGENTS.md and the guides relevant to the task.
2. Check Git status and preserve user changes. Inspect the current component, schema, and tests before assuming the status table is still accurate.
3. Identify a small end-to-end feature slice and any persisted-data migration it requires.
4. Read the installed Next.js guidance for affected framework APIs as required by AGENTS.md. Keep the existing Webpack scripts, which avoid a known worker problem in this Windows runtime.

Prefer reusable components, pure data services, and conventional readable formatting. Avoid new dependencies when the existing stack suffices. Do not introduce a second router, Vite application, or duplicate storage layer without a migration task.

## Baseline and target gaps

Recorded when these guides were added. “Existing” means source is present, not that external credentials or every edge case have been verified.

| Feature | Baseline | Next target |
| --- | --- | --- |
| Dashboard | Course cards, grade average, deadlines, sample announcements | Required assignment counts, structured/readable announcements, Demo Sync |
| Brand | Graduation-cap mark and existing welcome copy | Brain logo and “All your classes. One place.” tagline |
| Assignments | CRUD, completion, search, status/course filters, due-date sorting | Platform, priority, duration, due/platform/priority filters |
| AI | Dedicated study-tools page, server endpoint, labeled local fallback | Global collapsible chatbot grounded in shared structured data |
| Tasks | No separate task entity/page | Persistent To-Do List and completion progress |
| Notes | Course-linked text materials with create/edit/delete | Global Lecture Notes page and keyword search |
| Planner | Generic local catch-up checklist | Deterministic daily Plan My Week using deadline, priority, duration, workload |
| Calendar | Monthly assignment dates and editing | Course colors, personal tasks, detailed event display; week view optional |
| Classes | Four seeded course cards and detail tabs | Required five-course sample set and LMS metadata |
| Imports | Authenticated preview-only API; backup restore | Idempotent local demo assignment/announcement JSON refresh |
| Persistence | LocalStorage; explicit optional cloud save/load | Safe schema migration for new fields and entities |
| Grade tools | Weighted calculation, projection, syllabus parsing | Preserve behavior during frontend work |

Do not check off a target feature merely because a visual placeholder exists. Update this table after implementing and verifying a target.

## Commands

```sh
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

See README.md for Node requirements, Windows bundled pnpm path, local URL, and environment setup. `pnpm-workspace.yaml` configures the project-local store and permitted esbuild install script. Keep the lockfile in sync when dependencies change.

For documentation-only changes, check links, accuracy, and `git diff --check`; a full application rebuild is unnecessary. For code changes, run type checking, relevant tests, and the production build. Test behavior rather than duplicating implementation details. Explain unavailable credential-dependent verification honestly.

## Feature acceptance checklist

Apply the relevant checks to the feature being delivered. This is a target checklist, not a declaration that everything already passes.

### Dashboard and shared state

- [ ] All navigation targets work; unknown routes have a useful fallback.
- [ ] Counts use current workspace data and update after completing, adding, editing, or deleting coursework.
- [ ] Announcements show source, course, date, and persistent read state; newest appears first.
- [ ] Upcoming and overdue sections agree with filters, calendar, and chatbot date windows.

### Assignments and classes

- [ ] All required assignment fields are editable and displayed in a readable detail view.
- [ ] Course, date, platform, priority, and completion filters compose correctly and can be reset.
- [ ] Nearest-deadline sorting is stable; completion does not create an earned score.
- [ ] Each class opens only its associated assignments and notes; empty courses remain usable.
- [ ] Invalid dates, scores, and references are rejected without losing existing data.

### Global chatbot and planner

- [ ] Panel opens, collapses, and sends messages from every page; keyboard focus remains usable.
- [ ] All six sample questions in FRONTEND.md work against current data, including after edits.
- [ ] Test no matches, overdue work, tomorrow across month/year boundaries, ambiguous course names, and unsupported questions.
- [ ] The local assistant is clearly identified as rule-based; real AI errors are visible.
- [ ] Plan My Week excludes completed work, uses deadline/priority/duration, groups work by day, and explains overload or assumptions.
- [ ] Planning never silently changes deadlines, completion, or submissions.

### Notes, tasks, and calendar

- [ ] Notes can be created, searched, edited, deleted, assigned to a course, and reopened after reload.
- [ ] Summary controls distinguish configured AI from local tools and handle unavailable services.
- [ ] Tasks can be added, completed, and deleted; Today, Upcoming, Completed, and overdue handling are coherent.
- [ ] Task progress handles zero tasks and updates immediately.
- [ ] Calendar events show correct local dates, course colors plus labels, and clickable details.

### Persistence and imports

- [ ] Existing v1 saved data migrates without losing notes, assignments, or grades.
- [ ] Reload, export/restore, and cloud validation preserve new entities and fields.
- [ ] Two consecutive Demo Sync actions produce no duplicates and preserve manual data and completion/read state.
- [ ] Malformed imports leave the existing workspace intact; unsupported source/schema versions show useful errors.
- [ ] No key or service-role secret is in browser bundles, fixtures, logs, or committed environment files.

### Presentation and handoff

- [ ] Brain branding, tagline, blue/purple accents, and light/dark contrast match the frontend guide.
- [ ] Check desktop and a narrow mobile viewport, navigation, panel/dialog focus, empty states, and reduced motion.
- [ ] No unintended horizontal overflow, clipped forms, or obstructed mobile controls.
- [ ] Report installation/start commands, checks run, demo features, limitations, and integration extension points.
- [ ] Update README and these guides when behavior or contracts change.

## Git handoff

Keep commits scoped and exclude `.env.local`, dependencies, build output, and private student fixtures. Respect the user's requested repository visibility and push scope. When pushing is requested, verify the target remote and confirm the pushed commit exists remotely before reporting success. Do not change visibility or claim a push succeeded based only on a local commit.
