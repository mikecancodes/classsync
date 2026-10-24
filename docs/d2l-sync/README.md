# D2L sync spec

Design docs for connecting ClassSync to live D2L (Brightspace) data and hosting it.

| File | What's in it |
|---|---|
| [d2l-data-sources.md](d2l-data-sources.md) | Where data comes from: D2L API endpoints, the fields we use, and the iCal feed |
| [data-model.md](data-model.md) | Our tables, what each column means, and how D2L fields map onto them |
| [supabase-setup.md](supabase-setup.md) | Step-by-step Supabase setup, the full SQL to paste, and how the extension and dashboard talk to it |
| [chatbot-tools.md](chatbot-tools.md) | The functions the chatbot can call and the query behind each one |
| [extension.md](extension.md) | The browser extension prototype in `extension/`: install, setup, what it imports, limits |
| [vercel-hosting.md](vercel-hosting.md) | Deploying the Next.js app to Vercel: env vars, Supabase redirects, previews, cron |

## How the pieces fit

```
D2L tab ── browser extension ──supabase-js──▶ Supabase (Postgres + Auth)
                                                ▲          ▲
iCal feed ── Edge Function (every 30 min) ──────┘          │
Dashboard (logged in) ─────────────────────────────────────┤
Chatbot (local model, e.g. Ollama) ── tools ───────────────┘
```

Every row in every table belongs to one user (`user_id`), and Row Level Security makes sure people only ever see their own rows.

## How this relates to the current app

The app on `main` (see [AGENTS.md](../../AGENTS.md), [docs/agents/](../agents/) and the [team decisions](../agents/DECISIONS.md)) is the source of truth. These docs are a **proposal** for a later phase and do not override those guides.

| Topic | Current app | This proposal |
|---|---|---|
| Database | One `workspaces` row per user, JSONB document, manual cloud save (**decided:** auto-save when signed in) | Normalized tables (`courses`, `items`, …): a later option, not current work |
| D2L data | Demo data; `POST /api/imports/preview` validates future imports | Browser extension + iCal feed |
| AI | Gemini tool-calling chat in `/api/ai/chat` (implemented) | Same design; tools run in the browser |
| Extension | Prototype in `extension/`, separate from the app | Sends to the existing `/api/imports/preview`; future: direct sync into the tables above |

The proposed SQL creates new tables and does **not** touch `workspaces`, so both can exist in one Supabase project. Adopting it means migrating the app's state model first, per the migration rules in [ARCHITECTURE.md](../agents/ARCHITECTURE.md).
