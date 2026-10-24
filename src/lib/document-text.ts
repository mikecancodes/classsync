import { Unzip, UnzipInflate, strFromU8 } from 'fflate';

// A syllabus's text is well under this; anything bigger is likely a zip bomb
const MAX_DOCUMENT_XML_BYTES = 5 * 1024 * 1024;
const unreadable = () => new Error('This Word file couldn’t be read. Save it as .docx or PDF and try again.');

// Inflates only word/document.xml, counting the real output (declared sizes can lie) and
// stopping as soon as it passes the limit
function documentXml(bytes: Uint8Array) {
  const chunks: Uint8Array[] = [];
  let total = 0, tooBig = false, found = false;
  const unzip = new Unzip(file => {
    if (file.name !== 'word/document.xml' || found) return;
    found = true;
    if ((file.originalSize ?? 0) > MAX_DOCUMENT_XML_BYTES) { tooBig = true; return; }
    file.ondata = (error, chunk) => {
      if (error || tooBig) return;
      total += chunk.length;
      if (total > MAX_DOCUMENT_XML_BYTES) { tooBig = true; file.terminate(); return; }
      chunks.push(chunk);
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try { unzip.push(bytes, true); } catch { if (!tooBig) throw unreadable(); }
  if (tooBig) throw new Error('This Word file is too large to scan. Save the syllabus as a PDF or paste its text instead.');
  if (!found || !chunks.length) throw unreadable();
  const xml = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { xml.set(chunk, offset); offset += chunk.length; }
  return strFromU8(xml);
}

// Plain text from a Word .docx (a zip with word/document.xml), for scanning without AI and
// for sending to the AI model as text. Paragraphs and table cells become separate lines.
export function docxToText(bytes: Uint8Array): string {
  return documentXml(bytes)
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<\/w:p>|<w:br\/>|<\/w:tc>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function fileToBase64(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
