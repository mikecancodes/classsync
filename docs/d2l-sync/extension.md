# D2L browser extension

> **Status: prototype, kept outside the app.** This code lives in `extension/`, shares no code with the Next.js app and doesn't change it. It only *talks* to the app's existing `POST /api/imports/preview` endpoint.

The extension reads the signed-in student's D2L data and turns it into ClassSync's import format. It then either sends it to ClassSync for review or saves it as a JSON file.

> **Decided next step (DECISIONS.md 2):** instead of only calling `/api/imports/preview`, the extension will hand data to an open ClassSync tab, which shows a review screen and merges it. When `points` becomes optional (decision 6), remove the placeholder of 100 from `to-classsync.js`.

## How it works

```
                 Chrome
┌───────────────────────────────────────────────────────────────┐
│ popup.html  ── "Sync now" ──┐                                 │
│ options.html ── settings, sign-in, site access                │
│                             ▼                                 │
│ src/background.js  (runs hourly + on demand)                  │
│   1. collect   src/d2l-collect.js   GET /d2l/api/...          │
│                 · inside an open D2L tab if there is one      │
│                 · otherwise from the background worker        │
│   2. convert   src/to-classsync.js  D2L → import payload      │
│   3. send      src/classsync-api.js POST /api/imports/preview │
└───────────────────────────────────────────────────────────────┘
        │ D2L session cookie              │ Supabase access token
        ▼                                 ▼
  d2l.yourschool.edu               ClassSync app (validates, shows counts,
                                   requiresApproval: true. Nothing is saved yet.)
```

**Why it prefers an open D2L tab:** a request made from inside the D2L page goes to the same site, so the browser always includes your D2L login cookie. From the background worker the cookie is usually included too, but browsers are stricter there. So the tab path is the reliable one, and the background path is the fallback.

## Files

| File | Job |
|---|---|
| `manifest.json` | Chrome Manifest V3. Asks for **no websites up front** (`optional_host_permissions`) |
| `src/background.js` | Hourly alarm, "sync now" messages, status and toolbar badge |
| `src/d2l-collect.js` | D2L API calls. Self-contained, because it's injected into the D2L tab |
| `src/to-classsync.js` | Converts D2L data into the app's format. Pure function, tested |
| `src/classsync-api.js` | Supabase sign-in/refresh (REST, no SDK) and the call to the app |
| `options.html` / `options.js` | Settings, site-access request, ClassSync sign-in |
| `popup.html` / `popup.js` | Status, counts, warnings, **Sync now**, **Download JSON** |
| `test/to-classsync.test.ts` | Checks the converter's output against the app's real `stateSchema` |

No build step: Chrome loads the folder as-is.

## Install (developer mode)

1. Open `chrome://extensions` (also works in Edge and Brave).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension/` folder.
4. Pin **ClassSync D2L Sync** in the toolbar puzzle-piece menu.

After editing the code, click the ↻ reload icon on the extension's card.

## Set up

Open the extension's **Settings**:

1. **D2L address:** e.g. `https://d2l.yourschool.edu`. Pasting any D2L page URL works; only the domain is kept.
2. **ClassSync (optional):** the app address (`http://127.0.0.1:3000` locally, or the Vercel URL), the Supabase project URL and the **anon/publishable** key. These are the same values as `NEXT_PUBLIC_SUPABASE_*` in `.env.local`. Leave them blank to only download JSON.
3. Click **Save and grant access.** Chrome asks for access to exactly those sites.
4. **Sign in** with your ClassSync account (the same Supabase email/password as the app). The password is sent once and never stored; only the session tokens are kept.

Then sign in to D2L in a tab and click **Sync now** in the popup.

## What gets imported

| D2L | → ClassSync | Notes |
|---|---|---|
| Active course enrollments | `courses` | ID `d2l-<orgUnitId>`. Code clipped to 30 chars. One category, "Coursework", at 100% (D2L grade weights aren't imported yet) |
| Assignment folders (dropbox) | `assignments` | Due date, instructions, points. Score from feedback or the gradebook. `done` if submitted or graded |
| Quizzes, discussions, other dated items (`content/myItems/due`, `overdueItems`) | `assignments` | Skipped if they match an assignment by course + title (that assignment gets the D2L link instead). Exempt items are skipped |
| Announcements | `materials` (kind `material`) | Title "Announcement: …", newest 200. Hidden ones are skipped. This lets the study assistant read them |

**Placeholders and limits.** The app requires every assignment to have points above 0. When D2L has none (most quizzes and discussions here), the extension uses 100 and says so in the description. Scores outside 0 to max points, such as extra credit, are left blank, because the app rejects them. Items without a due date are skipped. Each of these adds a warning in the popup.

**Dates.** D2L sends UTC times, and the app stores local calendar dates. The converter uses your computer's time zone. That's why something due "Oct 25 03:59 UTC" shows as due Oct 24, which is 11:59pm Eastern.

## Statuses

| Popup message | Meaning | Fix |
|---|---|---|
| Open settings to add your D2L address | Not set up | Fill in settings |
| Open settings and click Save to grant access | Site access missing or revoked | Save settings again |
| Sign in to D2L, then sync again (badge `!`) | D2L session expired | Log in to D2L in a tab |
| Read D2L. Sign in to ClassSync… | ClassSync session expired | Sign in again in settings |
| Sent to ClassSync for review | Done | — |
| Read D2L, but sending failed: … | App unreachable or payload rejected | Check the app URL and that the app is running |

## Current limits

- **The app doesn't save imports yet.** `/api/imports/preview` validates and returns counts, nothing more. Saving needs the "import commit" endpoint and review screen listed as future work in the README. Until then, **Download JSON** gives you the payload.
- **Read-only.** The extension only sends GET requests to D2L. It never submits or changes anything there.
- **One school per install,** with one D2L address in settings.
- **Hourly sync needs Chrome running** and a live D2L session. See [the earlier design notes](d2l-data-sources.md).
- **Not yet tested against a real D2L site.** The endpoints and fields follow D2L's API docs, and the code was run against a mocked API. Expect small field differences at your school. Use **Download JSON** and the popup warnings to spot them.

## Development

```sh
pnpm install
pnpm exec tsx --test extension/test/*.test.ts
```

The test runs the converter's output through the app's real `stateSchema`. If the app's model changes (`src/lib/model.ts`), this test is what tells you the extension needs updating. Keep the limits at the top of `to-classsync.js` in sync with that file.

## Security notes

- Site access is requested per site at Save time, never for "all websites".
- Only the Supabase **anon** key is used. RLS protects data, and the app checks the token on every request. Never put the service_role key in the extension.
- Session tokens live in `chrome.storage.local`, which only this extension can read. Signing out deletes them.
- Announcement and instruction text is stored as **plain text** (`Body.Text`, not HTML), so instructor HTML is never put on a page unsanitized.
