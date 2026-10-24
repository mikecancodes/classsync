# D2L browser extension

The extension reads the signed-in student's D2L (Brightspace) data and hands it to the open ClassSync tab. The student reviews it there before anything is added. It lives in `extension/`, shares no code with the Next.js app, and only ever sends GET requests to D2L.

## For students: Connect your school

Open ClassSync → **Sync classes** → **Connect your school** (or go to `/connect`):

1. **Get the extension.** Download `classsync-extension.zip`, unzip it, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `classsync-extension` folder. The page notices the install by itself. Works in Chrome, Edge and Brave.
2. **Choose your school.** Search the list (University of North Georgia is first) or paste any page from your school's D2L.
3. **Connect.** The extension opens an **Allow access** page → click it and approve Chrome's prompt → your school's D2L sign-in opens (SSO / Duo as usual) → after you sign in, ClassSync shows **Review your classes** → **Add to ClassSync**.

Afterwards, **Sync classes** pulls in new work any time. A second sync shows only what changed.

## How it works

```
ClassSync tab (/connect)          extension                                  school D2L
────────────────────────          ─────────                                  ──────────
"ping" ───────────────▶ classsync-bridge.js ──▶ background: hello {installed, connected}
"connect {d2lOrigin}" ─▶ bridge ─▶ background ─▶ opens connect.html
                                                 [Allow access] → chrome.permissions.request
                                                 checks /d2l/api/versions/ is real D2L
                                                 opens <origin>/d2l/home ─────────────▶ sign in
                                                 tabs.onUpdated sees /d2l/home ◀───────
                                                 collectD2L → toImportPayload
"import-ready" ◀────── bridge ◀── background (stores pendingImport, focuses the tab)
"get-import" ─────────▶ … ─▶ payload → ImportReview dialog → mergeImport → workspace
"import-applied" ─────▶ … ─▶ background clears pendingImport
```

- **The bridge** (`src/classsync-bridge.js`) is injected only on the ClassSync site (manifest `content_scripts`). It forwards just six message types (`src/bridge-protocol.js`). `connect` must carry a bare `https://` origin, and the student still has to approve Chrome's prompt for that exact site.
- **Reading D2L** prefers an open D2L tab (same-origin requests always carry the session cookie) and otherwise calls from the background worker.
- **If the session expired**, the extension opens D2L's sign-in and resumes automatically once `/d2l/home` loads.
- **No background schedule.** Syncs happen on connect, on Sync, or from the popup, so dialogs never appear on their own.

## Files

| File | Job |
|---|---|
| `manifest.json` | MV3. Bridge on ClassSync (localhost here; the live site is added when packed). D2L access is optional and asked per school |
| `src/background.js` | Connect flow, login detection, sync, pending import, notifying ClassSync tabs, badge |
| `src/bridge-protocol.js` / `src/classsync-bridge.js` | Page ↔ extension messages and their checks |
| `connect.html` / `connect.js` | The Allow access page: permission prompt + D2L check |
| `src/d2l-collect.js` | D2L API calls. Self-contained, because it's injected into the D2L tab |
| `src/to-classsync.js` | D2L data → the app's import payload (courses, assignments, announcements) |
| `popup.*` / `options.*` | Status, Sync now, Open ClassSync, last-sync JSON download / Disconnect |
| `test/` | Converter vs. the app's real schema and merge; bridge message filter |

App side: `src/components/connect-page.tsx`, `src/components/import-review.tsx`, `src/lib/extension-bridge.ts` (the `useExtension` hook), `src/lib/d2l-import.ts`, `src/lib/schools.ts`.

## Packaging

`scripts/pack-extension.mjs` zips `extension/` (without `test/`) into `public/classsync-extension.zip` on every `pnpm dev` and `pnpm build`, or by hand with `pnpm pack:extension`. It points the zipped manifest at the live site from `CLASSSYNC_SITE_URL` (or Vercel's `VERCEL_PROJECT_PRODUCTION_URL`) and **removes the localhost entries**, so other apps on a student's computer can't reach the bridge. Builds in CI or on Vercel default to the live site, **https://classsync-two.vercel.app**. Set `CLASSSYNC_SITE_URL` only if the address changes. Local builds stay localhost-only. The zip is generated, so it's git-ignored.

Developers can also load `extension/` directly with Load unpacked. That works with `http://127.0.0.1:3000` and `http://localhost:3000`.

## What gets imported

| D2L | → ClassSync | Notes |
|---|---|---|
| Active course enrollments | `courses` | ID `d2l-<orgUnitId>`. One category, "Coursework", at 100% |
| Assignment folders (dropbox) | `assignments` | Due date, instructions, points, score from feedback or gradebook, `done` if submitted or graded |
| Quizzes, discussions, other dated items | `assignments` | Matched to dropbox items by course + title; exempt items skipped |
| Announcements | `announcements` | Platform `D2L`, newest 300, hidden ones skipped |

**When importing again** (`mergeImport`), D2L updates titles, due dates and descriptions. The student's completion, scores, read state, class color, instructor and grade categories are kept. Nothing is deleted. If a course's categories were renamed, a missing category is added at weight 0 so grade weights don't change. The whole import is validated before anything is applied.

**Placeholders:** the app still requires points on every assignment, so items without points use 100 and say so in the description. This goes away with decision 6 (optional points).

## Statuses

| Shown in ClassSync / popup | Meaning |
|---|---|
| Approve access in the tab that just opened | Waiting for the Allow click |
| Sign in to UNG D2L in the tab that opened… | Waiting for D2L sign-in; sync resumes automatically |
| Reading your classes from UNG D2L… | Syncing |
| Review your classes in ClassSync | Import ready (badge `1`) |
| Couldn't read D2L: … | Error (badge `×`). The popup's JSON download helps debug |

## Development

```sh
pnpm install
pnpm test            # includes extension/test
pnpm pack:extension  # rebuild the zip by hand
```

If the app's model changes (`src/lib/model.ts`), the extension tests show whether the converter still produces valid imports.

## Security notes

- D2L access is requested per school after a click, never "all websites". **Disconnect** in the extension's settings removes it.
- Live-site zips run the bridge only on the live site (localhost entries are stripped at pack time).
- The bridge only accepts same-window, same-origin messages tagged `classsync-app`, of six types. It never runs page-supplied code or URLs other than a validated https D2L origin, which the student must still approve.
- No passwords or tokens are handled: D2L uses the browser's own sign-in, and the extension no longer talks to Supabase.
- Announcements and instructions are imported as **plain text** (`Body.Text`), never HTML.
- Verified against the live UNG site address (`/d2l/api/versions/`). A full real-account sync still needs a student to sign in.
