import { z } from 'zod';

// Shared shapes for syllabus scanning: what the scan returns (from the AI model or the rule-based
// fallback) and what the /api/ai/syllabus route accepts.

export const SYLLABUS_ITEM_TYPES = ['assignment', 'quiz', 'exam', 'project', 'discussion', 'lab', 'reading', 'other'] as const;

export const syllabusItemSchema = z.object({
  title: z.string().trim().min(1).max(160),
  date: z.iso.date(),
  type: z.enum(SYLLABUS_ITEM_TYPES),
  points: z.number().positive().max(100000).optional(),
});
export type SyllabusItem = z.infer<typeof syllabusItemSchema>;

export const PDF_MIME = 'application/pdf';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const syllabusRequestSchema = z.object({
  course: z.object({ name: z.string().min(1).max(100), code: z.string().min(1).max(30) }),
  today: z.iso.date(),
  // PDFs are converted to text on the server; Word documents and pasted syllabi arrive as text
  file: z.object({ mimeType: z.literal(PDF_MIME), data: z.string().min(1).max(11_200_000) }).optional(),
  text: z.string().max(60000).optional(),
}).refine(r => Boolean(r.file) !== Boolean(r.text?.trim()), 'Send either a PDF or syllabus text.');

// JSON Schema for structured output (response_format)
export const syllabusResponseJsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name, e.g. "Exam 2" or "Lab 3: Circuits"' },
          date: { type: 'string', description: 'Due or exam date as YYYY-MM-DD' },
          type: { type: 'string', enum: [...SYLLABUS_ITEM_TYPES] },
          points: { type: 'number', description: 'Point value if the syllabus states one' },
        },
        required: ['title', 'date', 'type'],
      },
    },
    weights: {
      type: 'array',
      description: 'Grading breakdown, e.g. Exams 40%, Labs 25%',
      items: { type: 'object', properties: { name: { type: 'string' }, weight: { type: 'number', description: 'Percent of the final grade' } }, required: ['name', 'weight'] },
    },
  },
  required: ['items'],
};

export type SyllabusWeight = { name: string; weight: number };

// Grading categories with percentages: trimmed, de-duplicated, within 0-100, at most 20
export function parseSyllabusWeights(value: unknown): SyllabusWeight[] {
  const rows = (value && typeof value === 'object' && Array.isArray((value as { weights?: unknown }).weights)) ? (value as { weights: unknown[] }).weights : [];
  const seen = new Set<string>();
  const out: SyllabusWeight[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const name = String((row as { name?: unknown }).name ?? '').replace(/\s+/g, ' ').replace(/[\s:–-]+$/, '').trim().slice(0, 80);
    const weight = Number((row as { weight?: unknown }).weight);
    if (!name || !Number.isFinite(weight) || weight <= 0 || weight > 100 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, weight: Math.round(weight * 100) / 100 });
    if (out.length >= 20) break;
  }
  return out;
}

// Keeps only well-formed items; a single bad row never sinks the whole scan
export function parseSyllabusItems(value: unknown): SyllabusItem[] {
  const items = (value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)) ? (value as { items: unknown[] }).items : [];
  const seen = new Set<string>();
  const out: SyllabusItem[] = [];
  for (const raw of items) {
    const parsed = syllabusItemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const key = `${parsed.data.date}|${parsed.data.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed.data);
    if (out.length >= 200) break;
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
