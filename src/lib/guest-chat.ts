import { createHash } from 'node:crypto';

// Guest chat reads only the workspace supplied by this browser, never cloud data.
// Vercel sets x-vercel-forwarded-for at its trusted proxy boundary.
export function guestChatIdentity(request: Request): string | null {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return null;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return null;
  const address = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || 'unknown';
  return createHash('sha256').update(address).digest('hex');
}
