import { z } from 'zod';
import { readBody, allowRequest } from '@/lib/server';
import { fetchCalendarFeed } from '@/lib/calendar-fetch';
import { parseSchoolCalendar } from '@/lib/ical';

export const runtime = 'nodejs';
const schema = z.object({ url: z.string().min(1).max(4096), timeZone: z.string().min(1).max(100) }).strict();
const headers = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  let sameOrigin = false;
  try {
    const origin = new URL(request.headers.get('origin') ?? '');
    // Next dev can normalize request.url to localhost while the browser and
    // actual Host header use 127.0.0.1. Compare against the received host.
    const host = request.headers.get('host') ?? new URL(request.url).host;
    sameOrigin = ['http:', 'https:'].includes(origin.protocol) && origin.host === host;
  } catch { /* Missing or malformed Origin is rejected. */ }
  if (!sameOrigin) {
    return Response.json({ error: 'Sync calendars from the ClassSync app.' }, { status: 403, headers });
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local';
  if (!allowRequest('calendar:' + ip, 30)) return Response.json({ error: 'Calendar sync limit reached. Try again later.' }, { status: 429, headers });
  try {
    const body = schema.parse(await readBody(request, 8000));
    const text = await fetchCalendarFeed(body.url);
    return Response.json({ calendar: parseSchoolCalendar(text, body.timeZone) }, { headers });
  } catch {
    // Neither parser errors nor outbound network errors may echo the private URL.
    return Response.json({ error: 'Calendar sync failed. Use a public HTTPS .ics subscription link (not a login page); the feed must be under 1 MB with at most 500 events in the next year. Your existing calendar was preserved.' }, { status: 400, headers });
  }
}
