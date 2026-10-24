# Product and architecture decisions

Decided by the team on 2026-10-24 after reviewing every spec document for conflicts. **These override older wording elsewhere** (including the original frontend brief) until the other guides are updated to match. Each decision is *decided*, not yet *implemented*, unless its status says otherwise.

## Context

ClassSync is being built for an **MLH hackathon**. Several choices follow from that: AI runs on **Google Gemini because MLH gives participants free Gemini credits**; hosting and the database use free tiers (Vercel Hobby, Supabase Free), so the project costs nothing to run during the competition. Claim MLH perks (Gemini credits, a free .tech domain) through MyMLH / the MLH Software Lab.

| # | Topic | Decision | Status |
|---|---|---|---|
| 1 | Where data lives | **Hybrid with optional login:** browser workspace is the working copy; auto-saves to Supabase when signed in | Login exists (optional); auto-save not implemented (cloud save is still manual) |
| 2 | Getting D2L data into the app | **Extension → open ClassSync tab → review screen → merge** | Implemented (`/connect`, bridge content script, `src/lib/d2l-import.ts`, `ImportReview`) |
| 3 | AI provider | **Google Gemini**, chosen for the free MLH hackathon credits, behind `/api/ai` | Implemented (needs `GEMINI_API_KEY`; not yet tested with a live key) |
| 4 | Chatbot design | **Tool calling**, tools run in the browser against the workspace. AI on by default when configured and signed in; friendly tone, no emoji; no streaming | Implemented (`/api/ai/chat`, `src/lib/chat-tools.ts`); now handles general study/ClassSync questions and broad course context. Production still needs `GEMINI_API_KEY` and user sign-in. |
| 5 | UI components | **shadcn/ui** on top of the existing Tailwind tokens | Not implemented (styled native controls today) |
| 6 | Assignments without points | **`points` becomes optional**; grade math skips items without points | Not implemented (extension uses a placeholder of 100 for now) |
| 7 | Due times | **Optional `dueTime`** next to the existing date-only `due` | Not implemented |
| 8 | Platform values | Data uses lowercase **`d2l` · `canvas` · `manual`**; the UI shows "D2L", "Canvas", "Manual" | Not implemented (announcements use `'D2L' \| 'Canvas'`) |
| 9 | Live LMS data | The read-only browser extension in `extension/` is the live D2L path; official OAuth stays future work | Implemented (see decision 14) |
| 10 | Dashboard layout | **Top tabs, top-left ClassSync logo, center announcement feed with class/priority/status filters and sorting, persistent right-side desktop chat**; mobile chat collapses | Implemented |
| 11 | Sync classes interaction | Opens the **To-do list**. With a connected school it also asks the extension to sync; results appear in the import review dialog. Without one it shows the required failure message plus **Connect your school** | Implemented |
| 12 | Sample data | **No seeded data in the app.** Users start with an empty workspace and add or import their own; fake records live only in `tests/` fixtures | Implemented |
| 13 | Deployment | **Deploy to Vercel Production after every change** and confirm it reaches `Ready` (see AGENTS.md). Currently deployed via Vercel Drop, not Git-connected, so a push does not deploy | In effect |
| 14 | Getting the extension | **Download from the site** (`/classsync-extension.zip`) with a guided 3-step **Connect your school** page; no Chrome Web Store. School picker = searchable list (UNG first, `https://ung.view.usg.edu`) + paste any D2L link | Implemented |
| 15 | Syllabus dates and grades | Syllabi (found in D2L Content during Sync, or uploaded/pasted on a class's Syllabus tab) are scanned by **Gemini, with a rule-based fallback**; found dates become **assignments after review**. D2L **grade categories/weights, quiz and discussion scores, and graded items without an assignment** are imported | Implemented (final grade not stored yet: needs a model field) |
| 16 | Grades page | `/grades` overview card per class → `/grades/<class>` calculator with D2L assignments and weights already filled in; edits save directly, what-if mode never saves; replaces the old single-page calculator | Implemented |

## 1. Hybrid storage

- **Login stays optional.** Everything works without an account; signing in adds cloud backup and sync across devices, and gates the paid AI. (Considered and rejected: removing login entirely.)
- **Supabase is for sync and backup, not space.** Measured: the old demo workspace was 7.8 KB and a heavy semester (6 courses, 240 assignments with instructions, 60 announcements, 40 long notes) is about 900 KB, under a fifth of the ~5 MB browser limit. If files (PDFs, slides) are ever stored, use IndexedDB or Supabase Storage rather than localStorage.
- The localStorage workspace (`classsync-workspace-v2`) stays the source the UI reads, so offline use keeps working with no account.
- When signed in, changes **auto-save** to the existing `public.workspaces` JSONB row (debounced, e.g. 2 seconds after the last edit). On sign-in, compare `updated_at` and ask before replacing either copy. Never silently overwrite.
- This replaces "Keep cloud save/load explicit" in ARCHITECTURE.md. Manual Save/Load can remain as a backup control.
- The normalized tables in `docs/d2l-sync/` remain a **later** option, not current work.

## 2. Extension → app tab

```
D2L tab ── extension reads D2L ──▶ ClassSync tab (content script / externally_connectable)
                                     └─ review screen: "12 new assignments, 3 updated, 5 announcements"
                                          └─ user approves → merge into workspace (rules below)
                                               └─ auto-save to Supabase if signed in (decision 1)
```

- Merge by `platform` + source ID, so repeated imports never create duplicates. Keep local edits, completion and read state. Never delete manual work. (Demo Sync, which used to define these rules, was removed with the sample data in decision 12.)
- The review step is required: imports never apply silently.
- `/api/imports/preview` stays as a server-side validator. Being signed in is optional for importing.

## 3. Gemini

- Swap the provider inside `/api/ai` only. Browser code never sees a key. Use `GEMINI_API_KEY` server-side and keep the Google project on its Free Tier with billing disabled. The app pins `gemini-3.5-flash-lite` so quota exhaustion cannot move requests to a paid model.
- **Why Gemini:** we're in an MLH hackathon and MLH gives participants free Gemini credits (about $10/month plus a student plan, per MLH's partner page). Claim them through MyMLH / MLH Software Lab.
- Keep the Google project on Free Tier and do not enable billing; when free quota is exhausted, requests should stop rather than incur charges.
- Keep the existing guarantees: authentication for hosted AI use, rate limit, input limits, untrusted-content instructions, honest error labels.

## 4. Tool-calling chatbot

- The model gets a short list of tools (see `docs/d2l-sync/chatbot-tools.md`, adapted to the workspace): due items in a date range, overdue items, items by course, announcements, grades, and text search over notes and announcements.
- The loop: the browser sends a question to `/api/ai` → Gemini replies with a tool call → `/api/ai` returns it to the browser → the browser runs it against the local workspace → the browser sends the rows back → repeat until a text answer arrives. Personal coursework questions must use the workspace tools; general study and ClassSync usage questions can be answered from the model's knowledge, clearly separated from personal facts.
- Tools are the **same pure functions** the rule-based assistant uses (`src/lib/academic-assistant.ts`), so both modes give consistent answers.
- Tools are read-only. AI output never changes the workspace.
- This replaces sending the whole workspace (and its 40,000-character limit).

## 5. shadcn/ui

- Add components as they're needed (`pnpm dlx shadcn@latest add dialog …`). They're copied into the repo, so they're editable code, not a black-box dependency.
- Theme them with the CSS tokens in `src/app/globals.css`. Keep dark mode.
- This relaxes DEVELOPMENT.md's "avoid new dependencies" for shadcn/ui and the Radix primitives it brings. Other new dependencies still need a reason.

## 6–7. Model changes (future migration after calendar v3)

Bundle these into a single versioned migration, following ARCHITECTURE.md's migration rules:

| Field | Change | Legacy default |
|---|---|---|
| `assignment.points` | `number > 0` → **optional** | Keep existing values |
| `assignment.earned` | Allowed only when `points` is set | Unchanged |
| `assignment.dueTime` | New, optional `HH:MM` in local time | Absent = end of day |
| `course.platform`, `assignment.platform` | New: `d2l` · `canvas` · `manual` | `manual` |
| `announcement.platform` | `'D2L' \| 'Canvas'` → `'d2l' \| 'canvas'` | Lowercase the existing value |

The overdue rule stays date-based ("due date before today"). When `dueTime` is present, the chatbot and Upcoming views can also say "due in 3 hours".

## Update checklist when implementing

When a decision ships, flip its status above, update the "Baseline and target gaps" table in DEVELOPMENT.md, and update `src/lib/model.ts` together with the extension converter (`extension/src/to-classsync.js`). The extension tests check the converter against the real schema.


## 10–11. Latest dashboard correction

The user’s sketch and follow-up supersede older sidebar/deadline-first layouts and the old Demo Sync button (removed in decision 12). Home shows announcements by default, top tabs are Home / My Assignments / Lecture Notes / Material, branding is at the top left, and desktop chat reserves the right column. Sync classes opens the current-workspace To-do list in the left section immediately and must not claim an import occurred. The shadcn migration in decision 5 remains pending; the current delivered UI still uses the existing styled native controls.

## 12. No sample data

The app ships an empty workspace (`emptyWorkspace()` in `src/lib/workspace.ts`). Real data comes from the user, the D2L extension (decision 2) or a backup restore. Synthetic records exist only in `tests/fixtures.ts`.

## 13. Deployment

Per AGENTS.md: pull `main` before editing, then deploy to Vercel Production after changes and verify the deployment is `Ready`. The project is uploaded with Vercel Drop today, so pushing to GitHub does not deploy. Connecting the GitHub repo to Vercel (`docs/d2l-sync/vercel-hosting.md`) would make every push to `main` deploy automatically. That's a possible follow-up, not a decision yet.

## 14. Getting the extension and connecting a school

- `/connect` walks through: 1) download and load the extension (the page detects it automatically), 2) choose a school (`src/lib/schools.ts`; add schools there) or paste any D2L link, 3) **Connect**: the extension opens its own Allow page (Chrome only shows permission prompts there), checks the address is a real D2L site, then opens the school's sign-in. After `/d2l/home` loads, it reads D2L and the review dialog opens in ClassSync.
- The zip is built by `scripts/pack-extension.mjs` during `pnpm dev` and `pnpm build`. CI and Vercel builds point the zip at the live site, **https://classsync-two.vercel.app** (override with `CLASSSYNC_SITE_URL`). Local builds are localhost-only.
- No hourly background sync: syncing happens after connecting, when the student presses Sync, or from the extension popup, so review dialogs never pop up on their own.
- Chrome, Edge and Brave only (Manifest V3 + Load unpacked).

## School calendar addition

Workspace v3 adds cached school-calendar events only. Optional points, dueTime and platform changes above remain pending and require a later version. The Calendar page has the .ics link field and calendar Sync control; Home retains its D2L/To-do Sync behavior. No preview flow is added. Feed links stay browser-local and out of cloud saves/exports.

## 15. Syllabus dates and grades

- **Syllabus sources:** during Sync the extension downloads the first PDF/Word file in Content whose title or module mentions "syllabus" (≤ 8 MB). On any class's Syllabus tab, students can also scan an uploaded PDF/Word file or the pasted syllabus text.
- **Scanning:** `/api/ai/syllabus` sends PDFs to Gemini as a file and Word/text as text, with structured JSON output (`src/lib/syllabus.ts`), using the same free-tier model as chat. Without AI (no key or not signed in), `src/lib/syllabus-rules.ts` finds lines pairing a date with a deliverable word. PDFs then need AI or pasted text.
- **Review:** results appear with checkboxes in the import review (or on the Syllabus tab). Items matching an existing assignment (same class, within 2 days, mostly the same words) start unchecked. Added items use a matching grade category or a weight-0 "From syllabus" category, with points from the syllabus or the 100 placeholder (decision 6). The D2L syllabus file is also saved to the class's materials (this browser).
- **Grades:** grade categories become ClassSync categories with D2L's weights (points gradebooks use each category's share of max points), replacing only the untouched default bucket. Quiz/discussion scores match gradebook items by name. Graded items with no assignment are added as completed. Text, calculated and final-grade items are skipped. Until the student enters a score, D2L's points and category stay current on later syncs.
- **Not yet:** D2L's released final grade has no field in the workspace model.

## 16. Grades page

- `/grades` lists every class (current grade, letter, graded count, whether weights total 100%). Each card opens `/grades/<class>`, which the class page's Grades tab also shows.
- The calculator uses `grade()` from `model.ts` for the current grade (graded work only, blanks excluded, zeros counted), so it matches the dashboard and course cards. `src/lib/grade-math.ts` adds per-category averages and contributions, a projection that assumes one score on all remaining work (empty categories included), and the target solver.
- Score, points, category and weight edits save straight to the workspace. Renaming a category moves its assignments. Categories can be added, and removed only when empty. **What-if mode** works on a copy that's thrown away on exit, and can add hypothetical items.
- Replaces the previous single calculator in `panels.tsx`. Its syllabus weight extraction moved into the new page, keeping still-used categories at 0% so nothing breaks.
