# Product and architecture decisions

Decided by the team on 2026-10-24 after reviewing every spec document for conflicts. **These override older wording elsewhere** (including the original frontend brief) until the other guides are updated to match. Each decision is *decided*, not yet *implemented*, unless its status says otherwise.

| # | Topic | Decision | Status |
|---|---|---|---|
| 1 | Where data lives | **Hybrid:** browser workspace is the working copy; auto-saves to Supabase when signed in | Not implemented (cloud save is still manual) |
| 2 | Getting D2L data into the app | **Extension → open ClassSync tab → review screen → merge** | Not implemented (extension currently calls the preview API) |
| 3 | AI provider | **Google Gemini** (free MLH credits) behind `/api/ai` | Not implemented (OpenAI today) |
| 4 | Chatbot design | **Tool calling**, tools run in the browser against the workspace | Not implemented (sends whole workspace today) |
| 5 | UI components | **shadcn/ui** on top of the existing Tailwind tokens | Not implemented |
| 6 | Assignments without points | **`points` becomes optional**; grade math skips items without points | Not implemented (extension uses a placeholder of 100 for now) |
| 7 | Due times | **Optional `dueTime`** next to the existing date-only `due` | Not implemented |
| 8 | Platform values | Data uses lowercase **`d2l` · `canvas` · `manual`**; the UI shows "D2L", "Canvas", "Manual" | Not implemented (announcements use `'D2L' \| 'Canvas'`) |
| 10 | Dashboard layout | **Top tabs, top-right ClassSync logo, center announcement feed with class/priority/status filters and sorting, persistent right-side desktop chat**; mobile chat collapses | Implemented |
| 11 | Sync classes interaction | Opens a **To-do list** of current incomplete coursework with a class filter and completion controls. Actual class-sync logic is deferred | Implemented UI; sync backend deferred |
| 9 | Live LMS data | The read-only browser extension in `extension/` is the live D2L path; official OAuth stays future work | Extension prototype exists |

## 1. Hybrid storage

- The localStorage workspace (`classsync-workspace-v2`) stays the source the UI reads, so demo mode and offline use keep working with no account.
- When signed in, changes **auto-save** to the existing `public.workspaces` JSONB row (debounced, e.g. 2 seconds after the last edit). On sign-in, compare `updated_at` and ask before replacing either copy. Never silently overwrite.
- This replaces "Keep cloud save/load explicit" in ARCHITECTURE.md. Manual Save/Load can remain as a backup control.
- The normalized tables in `docs/d2l-sync/` remain a **later** option, not current work.

## 2. Extension → app tab

```
D2L tab ── extension reads D2L ──▶ ClassSync tab (content script / externally_connectable)
                                     └─ review screen: "12 new assignments, 3 updated, 5 announcements"
                                          └─ user approves → merge into workspace (same rules as Demo Sync)
                                               └─ auto-save to Supabase if signed in (decision 1)
```

- Merge by `platform` + source ID, as Demo Sync does. Keep local edits, completion and read state. Never delete manual work.
- The review step is required: imports never apply silently.
- `/api/imports/preview` stays as a server-side validator. Being signed in is optional for importing.

## 3. Gemini

- Swap the provider inside `/api/ai` only. Browser code never sees a key. New env var: `GEMINI_API_KEY` (server only), plus optional `GEMINI_MODEL`.
- Claim credits through MLH (MyMLH / MLH Software Lab). Set a usage cap in Google AI Studio.
- Keep the existing guarantees: authentication for paid use, rate limit, input limits, untrusted-content instructions, honest error labels.

## 4. Tool-calling chatbot

- The model gets a short list of tools (see `docs/d2l-sync/chatbot-tools.md`, adapted to the workspace): due items in a date range, overdue items, items by course, announcements, grades, and text search over notes and announcements.
- The loop: the browser sends a question to `/api/ai` → Gemini replies with a tool call → `/api/ai` returns it to the browser → the browser runs it against the local workspace → the browser sends the rows back → repeat until a text answer arrives.
- Tools are the **same pure functions** the rule-based assistant uses (`src/lib/academic-assistant.ts`), so both modes give consistent answers.
- Tools are read-only. AI output never changes the workspace.
- This replaces sending the whole workspace (and its 40,000-character limit).

## 5. shadcn/ui

- Add components as they're needed (`pnpm dlx shadcn@latest add dialog …`). They're copied into the repo, so they're editable code, not a black-box dependency.
- Theme them with the CSS tokens in `src/app/globals.css`. Keep dark mode.
- This relaxes DEVELOPMENT.md's "avoid new dependencies" for shadcn/ui and the Radix primitives it brings. Other new dependencies still need a reason.

## 6–7. Model changes (one migration, v3)

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

The user’s sketch and follow-up supersede older sidebar/deadline-first layouts and the old Demo Sync button. Home shows announcements by default, top tabs are Home / My Assignments / Lecture Notes / Material, branding is at the top right, and desktop chat reserves the right column. Sync classes opens the current-workspace To-do list immediately and must not claim an import occurred. The shadcn migration in decision 5 remains pending; the current delivered UI still uses the existing styled native controls.
