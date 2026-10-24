import { z } from 'zod';

// Shape of a /api/ai/chat request. The browser keeps the conversation and sends it each
// time, including the model's own turns verbatim (Gemini's thoughtSignature must survive).

export const MAX_TOOL_ROUNDS = 5;

const partSchema = z.object({
  text: z.string().max(20000).optional(),
  thought: z.boolean().optional(),
  thoughtSignature: z.string().max(50000).optional(),
  functionCall: z.object({ id: z.string().max(200).optional(), name: z.string().min(1).max(128), args: z.record(z.string(), z.unknown()).optional() }).optional(),
  functionResponse: z.object({ id: z.string().max(200).optional(), name: z.string().min(1).max(128), response: z.record(z.string(), z.unknown()) }).optional(),
});

const contentSchema = z.object({ role: z.enum(['user', 'model']), parts: z.array(partSchema).min(1).max(30) });
export type ChatContent = z.infer<typeof contentSchema>;

const isQuestion = (content: ChatContent) => content.role === 'user' && content.parts.some(p => p.text?.trim()) && !content.parts.some(p => p.functionResponse);
const isToolResults = (content: ChatContent) => content.role === 'user' && content.parts.some(p => p.functionResponse);

// The newest entry is the student's question rather than tool results
export const isNewQuestion = (contents: ChatContent[]) => contents.length > 0 && isQuestion(contents[contents.length - 1]);

// How many tool-result turns follow the most recent question
export function toolRoundsSinceQuestion(contents: ChatContent[]) {
  let rounds = 0;
  for (let i = contents.length - 1; i >= 0 && !isQuestion(contents[i]); i--) if (isToolResults(contents[i])) rounds++;
  return rounds;
}

function validTimeZone(timeZone: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone }); return true; } catch { return false; }
}

export const chatRequestSchema = z.object({
  contents: z.array(contentSchema).min(1).max(40),
  today: z.iso.date(),
  timeZone: z.string().min(1).max(64).refine(validTimeZone, 'Unknown time zone'),
}).superRefine((request, ctx) => {
  if (request.contents[request.contents.length - 1].role !== 'user') ctx.addIssue({ code: 'custom', message: 'The last turn must come from the user.' });
  if (toolRoundsSinceQuestion(request.contents) > MAX_TOOL_ROUNDS) ctx.addIssue({ code: 'custom', message: 'Too many lookups for one question.' });
});
