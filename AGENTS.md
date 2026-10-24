# ClassSync agent instructions

## Start here

ClassSync helps college students organize coursework and recover from missed classes. Keep the production workspace free of seeded or fabricated coursework; users start with an empty workspace and add or import their own data.

Before changing code, read:

0. [Team decisions](docs/agents/DECISIONS.md). These override older wording in the other guides and the brief.
1. [Frontend requirements](docs/agents/FRONTEND.md) for branding, pages, interactions, and priorities.
2. [Architecture and data rules](docs/agents/ARCHITECTURE.md) for state, migrations, AI, and LMS boundaries.
3. [Development and acceptance checks](docs/agents/DEVELOPMENT.md) for workflow and verification.
4. [Original frontend brief](docs/agents/FRONTEND-BRIEF.md) when exact product wording matters.

These guides describe the target product; they do not claim all features are implemented. The status table in DEVELOPMENT.md records the baseline at the time these guides were written. Verify the current source before starting work.

## Stack and scope

- This repository already uses Next.js App Router, React, TypeScript, Tailwind CSS, and Lucide React. Preserve that stack and the existing server routes. Build new UI with shadcn/ui components themed by the existing CSS tokens (decision 5).
- The supplied frontend brief proposes React/Vite and allows TypeScript if configured. Apply its product and frontend requirements to this Next.js application. A Vite migration is a separate task requiring an explicit request; do not reinitialize the project.
- Keep existing course pages, grade calculations, optional Supabase integration, and the secure server-side AI endpoint working (moving from OpenAI to Gemini, decision 3) when adding the new frontend features.
- The branding target is a **brain logo** beside **ClassSync**, with the tagline **All your classes. One place.** The brain mark and tagline are implemented.
- The approved dashboard uses top tabs (Home, My Assignments, Lecture Notes / Material), the brain/ClassSync logo at the top left, a center announcement feed with class/priority/status/sort filters, and a persistent right-side chatbot on desktop. This supersedes earlier left-sidebar or deadline-first designs. Home always keeps three left-to-right sections: Sync / To-do, centered Announcements, and ClassSync AI. Narrow viewports scroll horizontally rather than stacking sections. Other pages may collapse chat on mobile.
- **Sync classes** currently reveals the shared-workspace To-do list in the left section; real class sync is deliberately deferred. Do not claim it imports or refreshes class data.
- Follow the user's current task scope. A request for documentation does not authorize implementing every roadmap item.
- Keep local workspace features functional without credentials. Do not seed sample courses, assignments, notes, or announcements in the application. Synthetic records may exist only in test fixtures under `tests/`.
- **Required after every code change or commit:** pull the latest `main` before editing, then deploy the resulting project to Vercel Production after changes are ready, including changes made by an agent. Verify the deployment reaches `Ready` and report its URL. This repository is currently deployed through Vercel Drop and is not Git-connected, so a Git push does not trigger deployment. Use the Vercel project’s production deployment flow; if Vercel access is unavailable, report that clearly and do not claim the deployment happened.
- The D2L browser extension lives in `extension/` (see [docs/d2l-sync/extension.md](docs/d2l-sync/extension.md)). Keep it separate from the Next.js app, read-only toward the LMS (GET requests with the student's own session), and sending data only through the authenticated import endpoint. Run `pnpm exec tsx --test extension/test/*.test.ts` after changing `src/lib/model.ts`.
- Do not implement automatic assignment submission or authentication bypass.

## Working conventions

- Reuse domain schemas and shared state. Avoid independent page copies of assignments or tasks.
- Split new features into focused components and pure services. Avoid extending the existing large components indefinitely.
- Use readable, conventionally formatted TypeScript with descriptive names and comments for non-obvious decisions.
- Keep credentials out of client modules, logs, fixtures, and Git. `.env.example` contains placeholders only.
- Run checks appropriate to the change; see DEVELOPMENT.md. Report what was verified and any remaining limitations.
- Update the relevant guide when a change affects its contract or implementation status.

## Framework guidance

Preserve the following framework-managed block.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Empty sync state

Remove all historical generated class IDs, including math210, psych101, eng102 and the later demo set, along with their linked sample coursework. Preserve real courses by identity, never by name. When Sync classes is clicked with no courses, show: “Sync unsuccessful. Please log in to your student portal to sync classes.” Do not fabricate classes, show a successful sync, or show an all-caught-up result. Actual portal synchronization remains a future integration.
