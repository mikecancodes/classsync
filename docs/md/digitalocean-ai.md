# ClassSync AI on DigitalOcean (handoff)

**Status: implemented in code; needs a DigitalOcean key in Vercel to go live.** This file is for whoever (person or agent) configures and verifies production AI. You do not need to change application code to turn it on.

ClassSync's AI runs on **DigitalOcean serverless inference** with the open-weight model **`glm-5.3-flash`**. It replaced Google Gemini (decision 3 in [DECISIONS.md](../agents/DECISIONS.md)).

## What uses the AI

| Feature | Route | What the model receives |
|---|---|---|
| Chat (ClassSync AI panel) | `POST /api/ai/chat` | The conversation, plus results of read-only lookups the browser ran on the student's workspace (tool calling) |
| Study tools (Study tools page) | `POST /api/ai` | The material the student pasted or chose |
| Syllabus scanning | `POST /api/ai/syllabus` | Syllabus text. PDFs are converted to text **on the server** first (`unpdf`); Word files and pasted text arrive as text |

`GET /api/ai` reports `{ available, signInRequired }`. All three routes require a signed-in Supabase user in production (a loopback-only `ALLOW_LOCAL_AI=true` bypass exists for local development).

## Turn it on (production)

1. **DigitalOcean account owner:** Control Panel → **Inference** (serverless inference) → **Model Access Keys** → create a key. Copy it once; never paste it into chat, issues or Git.
2. **Vercel project (Ethan):** Project → Settings → Environment Variables, **Production** (and Preview if wanted):

   | Variable | Value | Notes |
   |---|---|---|
   | `DIGITALOCEAN_MODEL_ACCESS_KEY` | the key from step 1 | **Secret**, server only. Never prefix with `NEXT_PUBLIC_` |
   | `DIGITALOCEAN_MODEL` | optional, defaults to `glm-5.3-flash` | Must be a DO model that supports **tool calling** (`glm-5.2`, `glm-5.3-flash`, `mimo-v2.5-pro` per DO's model page). Llama models on DO don't list tool calling |
   | `AI_BASE_URL` | optional, defaults to `https://inference.do-ai.run/v1` | Only change for a different OpenAI-compatible endpoint |
   | `GEMINI_API_KEY`, `AI_CHAT_PROVIDER` | **delete them** | No longer used (Gemini was removed; DigitalOcean is the only provider) |

3. AI also needs sign-in: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be set (see [vercel-hosting.md](vercel-hosting.md)).
4. Redeploy (push to `main`, or Actions → Deploy to Vercel Production → Run workflow). Environment changes only apply to new deployments.
5. **Cost control (Ethan's rules):** DigitalOcean inference is usage-based, not a free tier. Use promotional credits only, leave auto-reload off, and set a spend limit on the key within the remaining credit. Never add funds or enable top-ups to keep the demo running; errors never fall back to another paid provider. The app limits each user to 120 chat round trips, 20 study-tool requests and 30 syllabus scans per hour, but these counters are **per server instance**, not global.

## Verify

```sh
# 1. Configured? (expects "available": true)
curl https://classsync-two.vercel.app/api/ai
# 2. Signed out → refused (expects 401)
curl -X POST https://classsync-two.vercel.app/api/ai/chat -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"hi"}],"today":"2026-10-24","timeZone":"America/New_York"}'
```

Then in a browser, signed in, with a few classes and assignments:

- [ ] ClassSync AI panel says **"AI · reads your ClassSync data"**; ask "What is due this week?" and see the status line ("Checking your assignments…") and an answer listing real items.
- [ ] Ask "what about for <class name>?" (memory across turns).
- [ ] Class → Syllabus tab → scan a **PDF** syllabus; dated items appear for review.
- [ ] Study tools → Summarize notes returns an "AI generated" answer.
- [ ] Page source / JS bundles don't contain the key (search for the first few characters).

If chat answers without looking anything up, the model probably isn't receiving tools: check `DIGITALOCEAN_MODEL` is a tool-calling model.

## How it works (for code changes)

| File | Role |
|---|---|
| `src/lib/ai.ts` | Server-only client (merged with Ethan's DigitalOcean provider and its safeguards): `fetch` to `${AI_BASE_URL}/chat/completions` with `Authorization: Bearer <key>`; chat instructions; `toChatReply`; `generateText`; `extractSyllabus` (asks for JSON via `response_format` json_schema and also parses JSON out of prose) |
| `src/lib/chat-tools.ts` | Tool declarations and the read-only functions the **browser** runs; `chatTools` is the OpenAI `tools` array |
| `src/lib/chat-request.ts` | Zod schema for the OpenAI-style `messages` the browser sends: user, assistant (with `tool_calls`) and `tool` results. Clients can't send `system` messages. Every tool result must match a call; max 5 lookup rounds per question |
| `src/components/chatbot.tsx` | The loop: send messages → if the reply has tool calls, run them locally and append `{ role: 'tool', tool_call_id, content }` → repeat until text |
| `src/lib/pdf-text.ts` | PDF → text with `unpdf` (first 40 pages, 60,000 characters) |
| `src/app/api/ai/*` | Routes: auth, body limits, rate limits, honest errors |

The browser never talks to DigitalOcean directly and never sees the key. Workspace data only leaves the browser as the specific rows a lookup returns.

## Known limits

- Scanned (image-only) PDFs have no text; the app asks the student to paste the syllabus text instead.
- Not yet tested against the live DigitalOcean endpoint (no key during development). Request and response formats follow DO's OpenAI-compatible API reference and are unit-tested with recorded shapes.
- Rate limits are in-memory per instance; add a shared limiter before a wide public launch.
