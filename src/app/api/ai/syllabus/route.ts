import { authenticate, allowRequest, localAIAllowed, readBody } from '@/lib/server';
import { syllabusRequestSchema } from '@/lib/syllabus';
import { extractSyllabus, geminiConfigured } from '@/lib/gemini';

// Reads dated deliverables out of a syllabus with Gemini. Nothing is saved here: the
// browser shows the results for the student to approve.
export async function POST(request: Request) {
  if (!geminiConfigured()) return Response.json({ error: 'AI is not configured on this server.' }, { status: 503 });
  const auth = await authenticate(request);
  if (!auth && !localAIAllowed(request)) return Response.json({ error: 'Sign in to scan syllabi with AI.' }, { status: 401 });

  let body;
  try { body = syllabusRequestSchema.parse(await readBody(request, 12_000_000)); }
  catch { return Response.json({ error: 'Invalid syllabus request. PDFs must be under 8 MB.' }, { status: 400 }); }

  if (!allowRequest(`syllabus:${auth?.user.id ?? 'local'}`, 30)) return Response.json({ error: 'Hourly syllabus scan limit reached. Please try again later.' }, { status: 429 });

  try { return Response.json({ items: await extractSyllabus(body) }); }
  catch { return Response.json({ error: 'The AI service couldn’t read this syllabus right now.' }, { status: 502 }); }
}
