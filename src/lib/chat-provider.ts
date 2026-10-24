import { generateChat, geminiConfigured } from './gemini';
import { digitalOceanConfigured, generateOceanChat } from './digitalocean';
import type { ChatContent } from './chat-request';

export const chatProvider = () => process.env.AI_CHAT_PROVIDER ?? 'gemini';
export const chatConfigured = () => chatProvider() === 'digitalocean' ? digitalOceanConfigured() : chatProvider() === 'gemini' && geminiConfigured();
export function generateProviderChat(contents: ChatContent[], today: string, timeZone: string) {
  if (chatProvider() === 'digitalocean') return generateOceanChat(contents, today, timeZone);
  if (chatProvider() === 'gemini') return generateChat(contents, today, timeZone);
  throw new Error('Unknown AI chat provider.');
}
