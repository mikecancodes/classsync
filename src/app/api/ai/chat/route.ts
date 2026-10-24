import { authenticate, allowRequest, readBody } from '@/lib/server';
import { guestChatIdentity } from '@/lib/guest-chat';
import { chatRequestSchema } from '@/lib/chat-request';
import { aiConfigured, generateChat } from '@/lib/ai';

export const maxDuration = 60;

// Tool-calling chat. Stateless: the browser sends the conversation, runs any requested
// lookups against its local workspace, and posts the results back for the next turn.
export async function POST(request: Request) {
  if (!aiConfigured()) return Response.json({ error: 'AI is not configured on this server.' }, { status: 503 });
  const auth = await authenticate(request);
  const guest = auth ? null : guestChatIdentity(request);
  if (!auth && !guest) return Response.json({ error: 'Open ClassSync to use chat.' }, { status: 403 });

  let body;
  try { body = chatRequestSchema.parse(await readBody(request, 200000)); }
  catch { return Response.json({ error: 'Invalid chat request.' }, { status: 400 }); }

  // Every round trip counts: one question plus up to five lookups is six requests
  // Instance-wide ceiling supplements the provider's key spending guard. These
  // counters are not a distributed quota; provider pause remains the cost control.
  if (!allowRequest(`chat:${auth?.user.id ?? guest}`, auth ? 120 : 30) || !allowRequest('chat:all', 240)) return Response.json({ error: 'Hourly AI limit reached. Please try again later.' }, { status: 429 });

  try { return Response.json(await generateChat(body.messages, body.today, body.timeZone)); }
  catch { return Response.json({ error: 'The AI service is unavailable right now. Try again, or answer locally.' }, { status: 502 }); }
}
