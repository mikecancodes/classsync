import { z } from 'zod';
import type { ChatContent } from './chat-request';
import { chatToolDeclarations } from './chat-tools';
import { chatInstructions } from './gemini';

// Server-side only. Use an inference model access key, never a full account token.
export const digitalOceanConfigured = () => Boolean(process.env.DIGITALOCEAN_MODEL_ACCESS_KEY && process.env.DIGITALOCEAN_MODEL);

type Message = { role: string; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]; tool_call_id?: string };

export function oceanMessages(contents: ChatContent[]): Message[] {
  return contents.flatMap((turn, turnIndex): Message[] => {
    const results = turn.parts.filter(part => part.functionResponse);
    if (results.length) return results.map(part => {
      const result = part.functionResponse!;
      if (!result.id) throw new Error('Tool result is missing its call ID.');
      return { role: 'tool', tool_call_id: result.id, content: JSON.stringify(result.response ?? {}) };
    });
    const text = turn.parts.filter(part => !part.thought && part.text).map(part => part.text).join('\n');
    const calls = turn.parts.filter(part => part.functionCall).map((part, index) => {
      const call = part.functionCall!;
      return { id: call.id ?? `call_${turnIndex}_${index}`, type: 'function' as const, function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) } };
    });
    return [{ role: turn.role === 'model' ? 'assistant' : 'user', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) }];
  });
}

const responseSchema = z.object({ choices: z.array(z.object({
  finish_reason: z.string().nullable().optional(),
  message: z.object({ content: z.string().nullable().optional(), tool_calls: z.array(z.object({
    id: z.string().min(1).max(200),
    type: z.literal('function'),
    function: z.object({ name: z.string().min(1).max(128), arguments: z.string().max(20000) }),
  })).max(30).optional() }),
})).min(1) });

export async function generateOceanChat(contents: ChatContent[], today: string, timeZone: string) {
  if (!digitalOceanConfigured()) throw new Error('DigitalOcean chat is not configured.');
  const response = await fetch('https://inference.do-ai.run/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DIGITALOCEAN_MODEL_ACCESS_KEY}` },
    body: JSON.stringify({
      model: process.env.DIGITALOCEAN_MODEL,
      messages: [{ role: 'system', content: chatInstructions(today, timeZone) }, ...oceanMessages(contents)],
      tools: chatToolDeclarations.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parametersJsonSchema } })),
      tool_choice: 'auto',
      max_completion_tokens: 2048,
      stream: false,
    }),
    signal: AbortSignal.timeout(45000),
    cache: 'no-store',
  });
  // Do not log provider bodies: they can contain private coursework or credentials.
  if (!response.ok) throw new Error('DigitalOcean inference failed.');
  const choice = responseSchema.parse(await response.json()).choices[0];
  if (choice.finish_reason === 'length') throw new Error('DigitalOcean answer was truncated.');
  const message = choice.message;
  if (message.tool_calls?.length) {
    const calls = message.tool_calls.map(call => {
      if (!chatToolDeclarations.some(tool => tool.name === call.function.name)) throw new Error('Unknown model tool.');
      const args = z.record(z.string(), z.unknown()).parse(JSON.parse(call.function.arguments));
      return { id: call.id, name: call.function.name, args };
    });
    const content: ChatContent = { role: 'model', parts: calls.map(call => ({ functionCall: call })) };
    return { type: 'tools' as const, content, calls };
  }
  const text = message.content?.trim();
  if (!text) throw new Error('DigitalOcean returned an empty answer.');
  return { type: 'text' as const, content: { role: 'model' as const, parts: [{ text }] }, text };
}
