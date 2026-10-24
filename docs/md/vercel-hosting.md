# Hosting ClassSync on Vercel

This guide deploys the current ClassSync application: a Next.js App Router site with server routes, optional Supabase auth/cloud storage, and optional server-side AI on DigitalOcean serverless inference (see [digitalocean-ai.md](digitalocean-ai.md)). It does not add a Vercel project or deploy the app.

## Before you start

- A Vercel account and access to the GitHub repository `mikecancodes/classsync`.
- A Supabase project if you want sign-in and cloud save/load. The app starts with an empty local workspace and does not require credentials for local workspace features.
- A DigitalOcean Model Access Key only if you want signed-in users to use AI chat, study tools and syllabus scanning. The app can run without it.

**The repository owner needs to import it.** `classsync` is in Mike’s personal GitHub account. Vercel requires the owner of a personal GitHub repository to import or connect it; a collaborator cannot create the Vercel project. Mike should connect the GitHub account and import the repo. If the project is on a Vercel Hobby team, check Vercel’s current commit-author restrictions before expecting every collaborator’s push to deploy.

## 1. Import the GitHub repository

1. Sign in to Vercel as the GitHub repository owner.
2. Choose **Add New → Project**, select `mikecancodes/classsync`, and import it.
3. Use the repository root (`.`) as the Root Directory.
4. Let Vercel detect **Next.js** and **pnpm**. Keep the framework-managed output directory and install command.
5. The repository’s `build` script runs `next build --webpack`; Vercel should use that script. Do not replace it with `next build` without checking why the project’s script uses Webpack.
6. Select a Vercel-supported Node.js version that meets the repository’s documented minimum of Node 20.9.
7. Add the environment variables below before the first deployment, then deploy.

There is no need to create a `vercel.json` for the current app. The repository has no Vercel Cron Job or custom deployment configuration.

## 2. Configure environment variables

In **Project → Settings → Environment Variables**, add the values below and select the environments that need them. Use a separate Supabase project for Preview deployments if you want to keep test data isolated from production.

| Variable | Required? | Vercel environments | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Only for sign-in/cloud features | Production and Preview | Public Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Only for sign-in/cloud features | Production and Preview | Public/publishable anon key. Database security depends on the configured Row Level Security policies. Never use the service-role key here. |
| `DIGITALOCEAN_MODEL_ACCESS_KEY` | Optional | Production and Preview | DigitalOcean Model Access Key, stored as a Secret. Server-side only; never add a `NEXT_PUBLIC_` prefix. Optional `DIGITALOCEAN_MODEL` (default `glm-5.3-flash`, must support tool calling) and `AI_BASE_URL`. Hosted AI requires sign-in. Remove any old `GEMINI_API_KEY`. |
| `CLASSSYNC_SITE_URL` | Only if the address changes (defaults to `https://classsync-two.vercel.app` in CI/Vercel builds) | Production | The live site address, e.g. `https://classsync.vercel.app`. Baked into the downloadable extension (`/classsync-extension.zip`) so it can talk to the live site. Without it the extension only works with localhost. |
| `ALLOW_LOCAL_AI` | Do not set on Vercel | None | Local-development bypass only. The server requires loopback and development mode for it. |

The two `NEXT_PUBLIC_*` variables are included in client-side code, so they are public values. Do not put credentials or private keys in variables with that prefix. Vercel applies changed variables to new deployments; redeploy after changing them.

For a deployment with an empty local workspace, leave the Supabase and AI variables unset. Users can add their own classes and coursework without credentials; sign-in, cloud save/load, and live AI will not be available.

## 3. Configure Supabase Auth and database

If using Supabase:

1. Create the required database table and Row Level Security policies using [`supabase/schema.sql`](../../supabase/schema.sql).
2. In Supabase **Authentication → URL Configuration**, set **Site URL** to the production URL Vercel assigns (or your custom domain later).
3. Add the exact production URL and local development URL to the allowed redirect URL list. Supabase supports wildcard patterns for Vercel preview URLs; restrict these to the intended Vercel account/team domain.
4. The current sign-up code does not pass a per-deployment `emailRedirectTo`, so confirmation links use Supabase’s Site URL by default. To direct confirmation links to individual Preview deployments, add that behavior in the app and allow the corresponding Preview URL pattern in Supabase.
5. Test sign-up, email confirmation, sign-in, and cloud save/load on the deployed production URL.

Use a separate Preview Supabase project when feasible. Do not place a Supabase service-role key in this frontend app. Cloud workspace access relies on the schema’s ownership policy.

## 4. Preview and production deployments

With Vercel Git integration, pushes to non-production branches create Preview deployments. Merging or pushing to the configured production branch (normally `main`) creates a Production deployment. Use a branch and pull request to review changes on a Preview URL before merging to `main`.

Preview and Production can have different environment values. Preview URLs are temporary deployment URLs; do not set them as the project’s permanent Supabase Site URL. Configure allowed Preview redirects separately if you add per-deployment redirect behavior.

## 5. Verify the deployment

After the first deployment:

- Open the production URL and confirm the dashboard loads with an empty workspace and no fabricated coursework.
- If Supabase is configured, test sign-up, confirmation, sign-in, and **Save to cloud / Load cloud copy**.
- If the AI key is configured, test chat, study tools and syllabus scanning while signed in (checklist in digitalocean-ai.md). Confirm unauthenticated requests are rejected and no provider key is visible in browser code.
- Confirm the deployment logs show the expected Next.js build and no missing-variable errors.

The repository currently starts with an empty workspace and supports an authenticated import-preview endpoint. It does not yet perform live Canvas or Brightspace imports. The study assistant has a labeled local fallback when no AI key is configured.

## 6. Production considerations

- The AI request limiter in `src/lib/server.ts` is in-memory and per function instance. Before a public multi-instance launch, replace it with shared rate limiting and set a usage cap in Google AI Studio.
- Keep Supabase and AI secrets in Vercel’s environment settings, never in Git or browser code. Use different Preview credentials where possible.
- Vercel environment variables are environment-specific; changing one does not alter an already-created deployment. Create a new deployment after changes.
- Add a custom domain only after the default `vercel.app` deployment and authentication flow work.
- Review current Vercel plan limits before enabling frequent scheduled jobs. ClassSync does not currently need a cron job to run.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Repository is missing during import | Ask the GitHub personal account owner to install/authorize Vercel for this repository and create the project. A personal-repo collaborator cannot import it. |
| Build uses the wrong directory | Set Root Directory to the repository root (`.`). |
| Login confirmation opens the wrong site | Set Supabase Site URL to the production URL and add the intended URL patterns to its allow list. |
| Preview uses production student data | Give Preview its own Supabase project and credentials. |
| AI says sign-in is required | Hosted AI requires Supabase authentication; `ALLOW_LOCAL_AI` is not a production bypass. |
| A changed variable has no effect | Create a new deployment so the updated environment value is applied. |

## References

- [Vercel: Deploying Git Repositories](https://vercel.com/docs/git)
- [Vercel: GitHub repository requirements](https://vercel.com/docs/git/vercel-for-github)
- [Vercel: Configuring a Build](https://vercel.com/docs/builds/configure-a-build)
- [Vercel: Environment Variables](https://vercel.com/docs/environment-variables)
- [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [ClassSync README](../../README.md)
- [D2L sync hosting notes](../d2l-sync/vercel-hosting.md)
