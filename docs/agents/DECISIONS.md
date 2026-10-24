# Product and architecture decisions

## Guest chatbot update — 2026-10-24

At Ethan's request, chatbot AI is available without signing in. This supersedes the chat sign-in requirement below. Study tools, syllabus AI and cloud backup retain their existing authentication. Guest chat accepts same-origin browser requests, limits each hashed Vercel proxy address to 30 round trips per hour and all chat to 240 per instance per hour. These counters are not global; the DigitalOcean key's $1 monthly pause guard and disabled auto-reload remain the provider cost controls. Production uses the already scoped `openai-gpt-oss-20b` key/model; do not switch models without updating its scope intentionally.

Decided by the team on 2026-10-24 after reviewing every spec document for conflicts. **These override older wording elsewhere** (including the original frontend brief) until the other guides are updated to match. Each decision is *decided*, not yet *implemented*, unless its status says otherwise.

## Context

ClassSync is being built for an **MLH hackathon**. Several choices follow from that: AI first ran on Google Gemini for MLH's free credits and **now runs on DigitalOcean serverless inference with an open-weight model** (decision 3). Originally: Gemini because MLH gives participants free Gemini credits**; hosting and the database use free tiers (Vercel Hobby, Supabase Free), so the project costs nothing to run during the competition. Claim MLH perks (Gemini credits, a free .tech domain) through MyMLH / the MLH Software Lab.

| # | Topic | Decision | Status |
|---|---|---|---|
| 1 | Where data lives | **Hybrid with optional login:** browser workspace is the working copy; auto-saves to Supabase when signed in | Login exists (optional); auto-save not implemented (cloud save is still manual) |
| 2 | Getting D2L data into the app | **Extension → open ClassSync tab → review screen → merge** | Implemented (`/connect`, bridge content script, `src/lib/d2l-import.ts`, `ImportReview`) |
| 3 | AI provider | **DigitalOcean serverless inference, open-weight `glm-5.3-flash`** (OpenAI-compatible, tool calling). Replaced Google Gemini on 2026-10-24 | Implemented (needs `DIGITALOCEAN_MODEL_ACCESS_KEY` in Vercel; see docs/md/digitalocean-ai.md) |
| 4 | Chatbot design | **Tool calling**, tools run in the browser against the workspace. AI on by default when configured and signed in; friendly tone, no emoji; no streaming | Implemented (`/api/ai/chat`, `src/lib/chat-tools.ts`); now handles general study/ClassSync questions and broad course context. Production still needs `DIGITALOCEAN_MODEL_ACCESS_KEY` and user sign-in. |
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
| 15 | Syllabus dates and grades | Syllabi (found in D2L Content during Sync, or uploaded/pasted on a class's Syllabus tab) are scanned by **the AI model, with a rule-based fallback**; found dates become **assignments after review**. D2L **grade categories/weights, quiz and discussion scores, and graded items without an assignment** are imported | Implemented (final grade not stored yet: needs a model field) |
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

## 3. AI provider: DigitalOcean (replaced Gemini)

- **Now:** DigitalOcean serverless inference (`https://inference.do-ai.run/v1`, OpenAI-compatible) with the open-weight model **`glm-5.3-flash`**, chosen because DO lists tool calling and structured outputs for it. Llama models on DO don't list tool calling, which the chat needs.
- Server-only `DIGITALOCEAN_MODEL_ACCESS_KEY`; optional `DIGITALOCEAN_MODEL` / `AI_BASE_URL`. Code in `src/lib/ai.ts`. Setup and verification for whoever configures Vercel: [docs/md/digitalocean-ai.md](../md/digitalocean-ai.md).
- The model reads text only, so PDFs are converted to text on the server (`src/lib/pdf-text.ts`) before syllabus scanning.
- Keep the existing guarantees: authentication for hosted AI use, rate limits, input limits, untrusted-content instructions, honest error labels. DO bills per token; set a billing alert.
- **History:** Gemini (Google AI Studio, MLH free credits, `gemini-3.5-flash-lite`) was used until 2026-10-24.

## 4. Tool-calling chatbot

- The model gets a short list of tools (see `docs/d2l-sync/chatbot-tools.md`, adapted to the workspace): due items in a date range, overdue items, items by course, announcements, grades, and text search over notes and announcements.
- The loop: the browser sends OpenAI-style messages to `/api/ai/chat` → the model replies with a tool call → `/api/ai` returns it to the browser → the browser runs it against the local workspace → the browser sends the rows back → repeat until a text answer arrives. Personal coursework questions must use the workspace tools; general study and ClassSync usage questions can be answered from the model's knowledge, clearly separated from personal facts.
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

- **Syllabus sources:** during Sync the extension searches Content files and D2L pages (PDF, Word, HTML, .txt) by title, file name and folder, plus the Course Overview attachment and text, and downloads the best readable match (≤ 8 MB). HTML pages and the Overview become text. If nothing is found, the sync review lists what was checked and the closest matches. On any class's Syllabus tab, students can also scan an uploaded PDF/Word file or the pasted syllabus text.
- **Scanning:** `/api/ai/syllabus` converts PDFs to text on the server, then asks the model for structured JSON (`src/lib/syllabus.ts`), using the same model as chat. Without AI (no key or not signed in), `src/lib/syllabus-rules.ts` finds lines pairing a date with a deliverable word. PDFs then need AI or pasted text.
- **Review:** results appear with checkboxes in the import review (or on the Syllabus tab). Items matching an existing assignment (same class, within 2 days, mostly the same words) start unchecked. Added items use a matching grade category or a weight-0 "From syllabus" category, with points from the syllabus or the 100 placeholder (decision 6). The D2L syllabus file is also saved to the class's materials (this browser).
- **Grades:** grade categories become ClassSync categories with D2L's weights (points gradebooks use each category's share of max points), replacing only the untouched default bucket. Quiz/discussion scores match gradebook items by name. Graded items with no assignment are added as completed. Text, calculated and final-grade items are skipped. Until the student enters a score, D2L's points and category stay current on later syncs.
- **Seeing what's scanned:** each class's Syllabus tab has a **Syllabus file** viewer (`src/components/syllabus-viewer.tsx`) showing the saved file (PDF preview or Word text), whether it came from D2L sync or an upload, with open/download/replace/remove. Every scan shows **"Text that was scanned"**; for PDFs the syllabus API returns the text it extracted (first 20,000 characters).
- **Not yet:** D2L's released final grade has no field in the workspace model.

## 16. Grades page

- `/grades` lists every class (current grade, letter, graded count, whether weights total 100%). Each card opens `/grades/<class>`, which the class page's Grades tab also shows.
- The calculator uses `grade()` from `model.ts` for the current grade (graded work only, blanks excluded, zeros counted), so it matches the dashboard and course cards. `src/lib/grade-math.ts` adds per-category averages and contributions, a projection that assumes one score on all remaining work (empty categories included), and the target solver.
- Score, points, category and weight edits save straight to the workspace. Renaming a category moves its assignments. Categories can be added, and removed only when empty. **What-if mode** works on a copy that's thrown away on exit, and can add hypothetical items.
- Replaces the previous single calculator in `panels.tsx`.
- **Weights come from the syllabus.** Syllabus scans (AI or the basic finder) return the grading breakdown as well as dates. The calculator's "Weights from the syllabus" panel reads the class's saved syllabus file (from D2L sync or an upload), an uploaded PDF/Word file, the Syllabus tab text or pasted text. It shows the weights and which assignments will move, then applies them (`src/lib/syllabus-weights.ts`): each assignment moves to the category its title fits (Midterm → Exams, Lab Report 3 → Lab Reports), and leftovers keep their old category at 0%. It's suggested automatically while a class still has a single 100% category. During a D2L sync, the review offers the syllabus weights (checked by default) for classes D2L gave no weights.


## 17. DigitalOcean chat provider (merged into decision 3)

Ethan added DigitalOcean as an optional chat provider (`AI_CHAT_PROVIDER=digitalocean`, Gemini kept for study tools and PDFs) at the same time the user decided to **replace Gemini entirely**. The two were merged: DigitalOcean is the only provider (`src/lib/ai.ts`), `AI_CHAT_PROVIDER` is gone, and Ethan's variable name `DIGITALOCEAN_MODEL` is kept (now optional, default `glm-5.3-flash`). His safeguards carry over: unknown tools and malformed arguments are rejected, truncated answers fail, provider responses are schema-checked and never logged, and errors never fall back to another paid provider. His cost rules stand: promotional credits only, auto-reload off, a key spend limit, and never claim it's a free tier. Live activation still needs a key in Vercel and a signed-in end-to-end test ([digitalocean-ai.md](../md/digitalocean-ai.md)).
