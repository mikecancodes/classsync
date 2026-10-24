import { z } from 'zod';

// Shape of a /api/ai/chat request (OpenAI-compatible messages). The browser keeps the
// conversation: the student's turns, the model's turns (including tool calls) and the
// results of the lookups it ran. The server adds the system instructions.

export const MAX_TOOL_ROUNDS = 5;

const toolCallSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.literal('function'),
  function: z.object({ name: z.string().min(1).max(128), arguments: z.string().max(20000) }),
});

const messageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), content: z.string().min(1).max(20000) }),
  z.object({ role: z.literal('assistant'), content: z.string().max(20000).nullable(), tool_calls: z.array(toolCallSchema).max(10).optional() }),
  z.object({ role: z.literal('tool'), tool_call_id: z.string().min(1).max(200), content: z.string().max(60000) }),
]);
export type ChatMessage = z.infer<typeof messageSchema>;

// The newest entry is the student's question rather than tool results
export const isNewQuestion = (messages: ChatMessage[]) => messages.length > 0 && messages[messages.length - 1].role === 'user';

// How many rounds of lookups (assistant tool calls) follow the most recent question
export function toolRoundsSinceQuestion(messages: ChatMessage[]) {
  let rounds = 0;
  for (let i = messages.length - 1; i >= 0 && messages[i].role !== 'user'; i--) {
    const message = messages[i];
    if (message.role === 'assistant' && message.tool_calls?.length) rounds++;
  }
  return rounds;
}

function validTimeZone(timeZone: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone }); return true; } catch { return false; }
}

export const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(60),
  today: z.iso.date(),
  timeZone: z.string().min(1).max(64).refine(validTimeZone, 'Unknown time zone'),
}).superRefine((request, ctx) => {
  const last = request.messages[request.messages.length - 1];
  if (last.role === 'assistant') ctx.addIssue({ code: 'custom', message: 'The last turn must be a question or tool results.' });
  if (toolRoundsSinceQuestion(request.messages) > MAX_TOOL_ROUNDS) ctx.addIssue({ code: 'custom', message: 'Too many lookups for one question.' });
  // Every tool result must answer a call the model actually made
  const callIds = new Set(request.messages.flatMap(m => m.role === 'assistant' ? (m.tool_calls ?? []).map(c => c.id) : []));
  if (request.messages.some(m => m.role === 'tool' && !callIds.has(m.tool_call_id))) ctx.addIssue({ code: 'custom', message: 'Tool result without a matching call.' });
});
