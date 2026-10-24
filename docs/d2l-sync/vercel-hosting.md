# Hosting on Vercel

ClassSync is a Next.js app, and Vercel builds and hosts Next.js with no extra configuration: the pages, and the API routes in `src/app/api/` (which run as Vercel Functions). Supabase stays the database. Vercel only runs the app.

```
GitHub (mikecancodes/classsync)
   │ every push
   ▼
Vercel ── builds with pnpm ──▶ https://classsync-xxxx.vercel.app
   │                              │
   │ env vars                     ├── pages (dashboard, courses…)
   │                              └── /api/ai, /api/workspace, /api/imports/preview
   ▼                                      │
OPENAI_API_KEY, Supabase keys             ▼
                                   Supabase (database + logins)
```

## 1. Import the repo

The repo belongs to **mikecancodes**, so **Mike should do this step** from his Vercel account. Vercel connects to the GitHub account that owns the repo.

1. Sign in at [vercel.com](https://vercel.com) with GitHub.
2. **Add New → Project** → pick `classsync` → **Import**.
3. Vercel detects Next.js and pnpm (from `pnpm-lock.yaml`). Leave the build settings at their defaults. The repo's `build` script already uses the right command.
4. Add the environment variables from step 2 *before* the first deploy, then click **Deploy**.

On the free Hobby plan, private-repo deploys can be limited to commits from the account owner. If pushes from Bralin don't trigger deploys, check Vercel's current Hobby rules, or add each other to a Vercel team.

## 2. Environment variables

**Project → Settings → Environment Variables.** The same names as `.env.example`:

| Name | Value | Environments | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | All | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key | All | Public; safe because of RLS |
| `OPENAI_API_KEY` | Your key | Production, Preview | **Secret.** Server only |
| `OPENAI_MODEL` | e.g. `gpt-4.1-mini` | All | Optional |
| `ALLOW_LOCAL_AI` | **don't set it** | — | Local-development bypass only. The app already refuses it outside loopback; keep it out of Vercel anyway |

- `NEXT_PUBLIC_*` values are baked in at **build time**. After changing one, **redeploy** for it to take effect.
- Never add the Supabase **service_role** key unless a server-only route (like a cron job) needs it, and never with a `NEXT_PUBLIC_` prefix.
- To copy Vercel's variables to your computer: install the CLI (`npm i -g vercel`), run `vercel link`, then `vercel env pull .env.local`.

Optional: Vercel's **Marketplace → Supabase** integration can create a Supabase project and fill in the env vars for you. If you already made the project, adding the variables by hand is simpler.

## 3. Tell Supabase about the new URLs

Supabase only sends login and confirmation emails that link to URLs it trusts.

**Supabase → Authentication → URL Configuration:**
- **Site URL:** your production URL, e.g. `https://classsync.vercel.app`
- **Redirect URLs:** add
  - `https://classsync.vercel.app/**`
  - `https://*-<your-vercel-team>.vercel.app/**` (preview deployments)
  - `http://127.0.0.1:3000/**` (local development)

If sign-up emails link to `localhost` or login redirects fail, this step is usually the cause.

## 4. How deploys work

| You do | Vercel does |
|---|---|
| Push to `main` | Deploys to **production** |
| Push any other branch / open a PR | Builds a **preview** with its own URL, posted on the PR |
| Click **Instant Rollback** on an older deployment | Production goes back to it in seconds |

Previews use the "Preview" env vars. To keep test data out of your real database, give Preview its own Supabase project.

## 5. Things that change once it's hosted

- **Rate limiting.** `src/lib/server.ts` counts AI requests in memory, per server instance. Vercel runs several instances, so each one has its own count. The README already flags this. Before sharing the site widely, move the counter to shared storage (e.g. a Supabase table or Redis from the Vercel Marketplace) and set a spending limit in your OpenAI account.
- **Local models don't work hosted.** A Vercel function can't reach Ollama on your laptop. Hosted chat uses OpenAI (already wired up), and a local model is only for running the app on your own machine.
- **The browser extension** (future) must list the Vercel domain in its `host_permissions` to send data to the app.
- **Function time limits.** Vercel Functions default to a 300-second limit, which is plenty for AI calls. Stream long responses rather than waiting for the whole answer.

## 6. Scheduled jobs (future: iCal sync)

Vercel Cron Jobs call one of your API routes on a schedule:

```ts
// vercel.ts (recommended over vercel.json; needs `pnpm add -D @vercel/config`)
import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [{ path: "/api/cron/ical", schedule: "0 11 * * *" }], // daily at 11:00 UTC (~6-7am US Eastern)
};
```

- Set a `CRON_SECRET` env var. Vercel sends it as `Authorization: Bearer <CRON_SECRET>`, and the route must reject requests without it.
- The cron route runs without a logged-in user, so it needs the Supabase service_role key (server only) and must set `user_id` on every row itself.
- **Hobby plan cron jobs run at most once a day.** For syncing every 30 minutes, either upgrade to Pro or run the job inside Supabase instead (Edge Function + `pg_cron`, see [supabase-setup.md](supabase-setup.md#6-ical-sync-later)).

## Checklist

- [ ] First deploy succeeds and the app loads in demo mode
- [ ] Env vars set; redeployed after adding `NEXT_PUBLIC_*` ones
- [ ] Supabase Site URL and Redirect URLs include the Vercel domains
- [ ] Sign up → confirmation email → link opens the Vercel site, not localhost
- [ ] **Save to cloud / Load cloud copy** works while signed in
- [ ] AI tools work while signed in, and are refused while signed out
- [ ] `OPENAI_API_KEY` doesn't appear in any browser code (search the page source)
- [ ] OpenAI spending limit set
