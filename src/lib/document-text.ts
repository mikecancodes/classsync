import { unzipSync, strFromU8 } from 'fflate';

// Plain text from a Word .docx (a zip with word/document.xml), for scanning without AI and
// for sending to Gemini as text. Paragraphs and table cells become separate lines.
export function docxToText(bytes: Uint8Array): string {
  let xml: string;
  try {
    const files = unzipSync(bytes, { filter: file => file.name === 'word/document.xml' });
    const doc = files['word/document.xml'];
    if (!doc) throw new Error('missing document');
    xml = strFromU8(doc);
  } catch {
    throw new Error('This Word file couldn’t be read. Save it as .docx or PDF and try again.');
  }
  return xml
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
