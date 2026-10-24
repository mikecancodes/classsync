import { getDocumentProxy } from 'unpdf';

// Server-side PDF → text for syllabus scanning (the AI model reads text, not PDFs).
// Bounded on every axis so an oversized or hostile PDF can't tie up the function.
const MAX_PAGES = 40;
const MAX_CHARS = 60000;
const MAX_ITEMS_PER_PAGE = 5000;
const TIME_LIMIT_MS = 15000;

class PdfLimitError extends Error {}

// Gives up on a slow step once the deadline passes. The route's maxDuration is the hard
// stop if the parser itself keeps running.
function beforeDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new PdfLimitError());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PdfLimitError()), remaining); });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function pdfToText(bytes: Uint8Array, timeLimitMs = TIME_LIMIT_MS) {
  const deadline = Date.now() + timeLimitMs;
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try { pdf = await beforeDeadline(getDocumentProxy(bytes), deadline); }
  catch (err) { throw new Error(err instanceof PdfLimitError ? 'This PDF took too long to read. Paste the syllabus text instead.' : 'This PDF couldn’t be read.'); }

  try {
    const lines: string[] = [];
    let length = 0;
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES) && length < MAX_CHARS; n++) {
      if (Date.now() >= deadline) throw new PdfLimitError();
      const page = await beforeDeadline(pdf.getPage(n), deadline);
      const content = await beforeDeadline(page.getTextContent(), deadline);
      // Group text runs by vertical position so table rows stay on one line
      const rows = new Map<number, string[]>();
      let pageChars = 0;
      for (const item of content.items.slice(0, MAX_ITEMS_PER_PAGE)) {
        if (!('str' in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        const row = rows.get(y);
        if (row) row.push(item.str); else rows.set(y, [item.str]);
        pageChars += item.str.length + 1;
        if (length + pageChars >= MAX_CHARS) break;
      }
      for (const [, parts] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
        const line = parts.join(' ').replace(/\s+/g, ' ').trim();
        lines.push(line);
        length += line.length + 1;
        if (length >= MAX_CHARS) break;
      }
      lines.push('');
    }
    if (Date.now() > deadline) throw new PdfLimitError();
    return lines.join('\n').slice(0, MAX_CHARS).trim();
  } catch (err) {
    if (err instanceof PdfLimitError) throw new Error('This PDF took too long to read. Paste the syllabus text instead.');
    throw new Error('This PDF couldn’t be read.');
  } finally {
    await pdf.cleanup().catch(() => {});
  }
}
