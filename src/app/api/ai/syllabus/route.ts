import { authenticate, allowRequest, localAIAllowed, readBody } from '@/lib/server';
import { syllabusRequestSchema } from '@/lib/syllabus';
import { aiConfigured, extractSyllabus } from '@/lib/ai';
import { pdfToText } from '@/lib/pdf-text';

// Hard stop for the whole request (PDF parsing + AI call), enforced by the platform
export const maxDuration = 30;

// Reads dated deliverables out of a syllabus with the AI model. PDFs are converted to text
// here first. Nothing is saved: the browser shows the results for the student to approve.
export async function POST(request: Request) {
  if (!aiConfigured()) return Response.json({ error: 'AI is not configured on this server.' }, { status: 503 });
  const auth = await authenticate(request);
  if (!auth && !localAIAllowed(request)) return Response.json({ error: 'Sign in to scan syllabi with AI.' }, { status: 401 });

  let body;
  try { body = syllabusRequestSchema.parse(await readBody(request, 12_000_000)); }
  catch { return Response.json({ error: 'Invalid syllabus request. PDFs must be under 8 MB.' }, { status: 400 }); }

  if (!allowRequest(`syllabus:${auth?.user.id ?? 'local'}`, 30)) return Response.json({ error: 'Hourly syllabus scan limit reached. Please try again later.' }, { status: 429 });

  let text = body.text ?? '';
  if (body.file) {
    try { text = await pdfToText(new Uint8Array(Buffer.from(body.file.data, 'base64'))); }
    catch { return Response.json({ error: 'This PDF couldn’t be read. Try saving it again or paste the syllabus text.' }, { status: 422 }); }
    if (text.length < 40) return Response.json({ error: 'This PDF has no selectable text (it may be a scanned image). Paste the syllabus text instead.' }, { status: 422 });
  }

  try { return Response.json({ items: await extractSyllabus({ course: body.course, today: body.today, text }) }); }
  catch { return Response.json({ error: 'The AI service couldn’t read this syllabus right now.' }, { status: 502 }); }
}
