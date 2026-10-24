# ClassSync agent instructions

## Start here

ClassSync helps college students organize coursework and recover from missed classes. Deliver a polished, functional hackathon demo with honest labels for simulated data and rule-based assistance.

Before changing code, read:

1. [Frontend requirements](docs/agents/FRONTEND.md) for branding, pages, interactions, and priorities.
2. [Architecture and data rules](docs/agents/ARCHITECTURE.md) for state, migrations, AI, and LMS boundaries.
3. [Development and acceptance checks](docs/agents/DEVELOPMENT.md) for workflow and verification.
4. [Original frontend brief](docs/agents/FRONTEND-BRIEF.md) when exact product wording matters.

These guides describe the target product; they do not claim all features are implemented. The status table in DEVELOPMENT.md records the baseline at the time these guides were written. Verify the current source before starting work.

## Stack and scope

- This repository already uses Next.js App Router, React, TypeScript, Tailwind CSS, and Lucide React. Preserve that stack and the existing server routes.
- The supplied frontend brief proposes React/Vite and allows TypeScript if configured. Apply its product and frontend requirements to this Next.js application. A Vite migration is a separate task requiring an explicit request; do not reinitialize the project.
- Keep existing course pages, grade calculations, optional Supabase integration, and secure OpenAI endpoints working when adding the new frontend features.
- The branding target is a **brain logo** beside **ClassSync**, with the tagline **All your classes. One place.** The current graduation-cap branding is a known implementation gap.
- Follow the user's current task scope. A request for documentation does not authorize implementing every roadmap item.
- Keep demo mode functional without credentials. Never imply demo LMS data or rule-based responses come from live services.
- Do not implement a Chrome extension, automatic assignment submission, private-account scraping, or authentication bypass as part of the frontend MVP.

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
