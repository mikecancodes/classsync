import { authenticate, allowRequest, localAIAllowed, readBody } from '@/lib/server';
import { chatRequestSchema } from '@/lib/chat-request';
import { generateProviderChat, chatConfigured } from '@/lib/chat-provider';

// Tool-calling chat. Stateless: the browser sends the conversation, runs any requested
// lookups against its local workspace, and posts the results back for the next turn.
export async function POST(request: Request) {
  if (!chatConfigured()) return Response.json({ error: 'AI is not configured on this server.' }, { status: 503 });
  const auth = await authenticate(request);
  if (!auth && !localAIAllowed(request)) return Response.json({ error: 'Sign in to use AI chat.' }, { status: 401 });

  let body;
  try { body = chatRequestSchema.parse(await readBody(request, 200000)); }
  catch { return Response.json({ error: 'Invalid chat request.' }, { status: 400 }); }

  // Every round trip counts: one question plus up to five lookups is six requests
  if (!allowRequest(`chat:${auth?.user.id ?? 'local'}`, 120)) return Response.json({ error: 'Hourly AI limit reached. Please try again later.' }, { status: 429 });

  try { return Response.json(await generateProviderChat(body.contents, body.today, body.timeZone)); }
  catch { return Response.json({ error: 'The AI service is unavailable right now. Try again, or answer locally.' }, { status: 502 }); }
}
