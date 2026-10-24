import { Course, dateKey } from './model';
import { supabase } from './supabase';
import { PDF_MIME, parseSyllabusItems, parseSyllabusWeights, type SyllabusItem, type SyllabusWeight } from './syllabus';
import { findSyllabusDates, findSyllabusWeights } from './syllabus-rules';
import { base64ToBytes, docxToText } from './document-text';

// Scans a syllabus in the browser: the AI model when it's configured and allowed, otherwise the
// rule-based date finder (which needs text, so PDFs require AI).

export type ScanSource = { kind: 'pdf'; base64: string } | { kind: 'docx'; base64: string } | { kind: 'text'; text: string };
export type ScanResult = { items: SyllabusItem[]; weights: SyllabusWeight[]; method: 'ai' | 'rules'; note?: string; scannedText?: string };

async function aiAccess(): Promise<{ usable: boolean; token?: string; reason: string }> {
  const status = await fetch('/api/ai', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ available: false }));
  if (status.available !== true) return { usable: false, reason: 'AI isn’t set up on this server' };
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (status.signInRequired !== false && !token) return { usable: false, reason: 'Sign in under Settings to scan with AI' };
  return { usable: true, token, reason: '' };
}

export async function scanSyllabus(source: ScanSource, course: Pick<Course, 'name' | 'code'>, today = dateKey()): Promise<ScanResult> {
  const text = source.kind === 'text' ? source.text : source.kind === 'docx' ? docxToText(base64ToBytes(source.base64)) : undefined;
  const access = await aiAccess();
  let aiFailed = '';
  if (access.usable) {
    try {
      const response = await fetch('/api/ai/syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(access.token ? { Authorization: `Bearer ${access.token}` } : {}) },
        body: JSON.stringify({ course: { name: course.name, code: course.code }, today, ...(source.kind === 'pdf' ? { file: { mimeType: PDF_MIME, data: source.base64 } } : { text: (text ?? '').slice(0, 60000) }) }),
        signal: AbortSignal.timeout(70000),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'AI scan failed');
      return { items: parseSyllabusItems(json), weights: parseSyllabusWeights(json), method: 'ai', scannedText: typeof json.text === 'string' ? json.text : text };
    } catch (err) {
      aiFailed = err instanceof Error ? err.message : 'AI scan failed';
    }
  }
  const reason = aiFailed || access.reason;
  if (text === undefined) throw new Error(`${reason}. PDF syllabi need AI to scan; you can paste the syllabus text into the Syllabus tab and scan that instead.`);
  return { items: findSyllabusDates(text, today), weights: parseSyllabusWeights({ weights: findSyllabusWeights(text) }), method: 'rules', note: `${reason}, so the basic finder was used. Check the results carefully.`, scannedText: text };
}
