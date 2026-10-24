import type { SyllabusItem } from './syllabus';

// Fallback when AI isn't available: finds lines that pair a date with a deliverable word.
// Simple on purpose. It misses schedules written as tables and anything without a date.

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const TYPE_WORDS: [SyllabusItem['type'], RegExp][] = [
  ['exam', /\b(exam|midterm|final|test)\b/i],
  ['quiz', /\bquiz(zes)?\b/i],
  ['project', /\b(project|paper|essay|presentation|report)\b/i],
  ['lab', /\blab\b/i],
  ['discussion', /\b(discussion|forum|post)\b/i],
  ['assignment', /\b(assignment|homework|hw|problem set|due)\b/i],
];
const MONTH_NAME = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_PATTERNS: RegExp[] = [
  new RegExp(`\\b${MONTH_NAME}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'),
  /\b(\d{4})-(\d{2})-(\d{2})\b/,
  /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/,
];

const pad = (n: number) => String(n).padStart(2, '0');
const valid = (y: number, m: number, d: number) => {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

// Without a year, choose the one that lands within about a term of today
function withYear(month: number, day: number, today: string) {
  const year = Number(today.slice(0, 4));
  const candidates = [year - 1, year, year + 1].filter(y => valid(y, month, day));
  const t = new Date(`${today}T12:00:00`).getTime();
  return candidates.sort((a, b) => Math.abs(new Date(a, month - 1, day).getTime() - t) - Math.abs(new Date(b, month - 1, day).getTime() - t))[0];
}

function findDate(line: string, today: string): { date: string; match: string } | null {
  const named = line.match(DATE_PATTERNS[0]);
  if (named) {
    const month = MONTHS[named[1].toLowerCase().slice(0, named[1].toLowerCase().startsWith('sept') ? 4 : 3)];
    const day = Number(named[2]);
    const year = named[3] ? Number(named[3]) : withYear(month, day, today);
    if (year && valid(year, month, day)) return { date: `${year}-${pad(month)}-${pad(day)}`, match: named[0] };
  }
  const iso = line.match(DATE_PATTERNS[1]);
  if (iso && valid(Number(iso[1]), Number(iso[2]), Number(iso[3]))) return { date: iso[0], match: iso[0] };
  const slash = line.match(DATE_PATTERNS[2]);
  if (slash) {
    const month = Number(slash[1]), day = Number(slash[2]);
    const year = slash[3] ? (slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3])) : withYear(month, day, today);
    if (year && valid(year, month, day)) return { date: `${year}-${pad(month)}-${pad(day)}`, match: slash[0] };
  }
  return null;
}

export function findSyllabusDates(text: string, today: string): SyllabusItem[] {
  const items: SyllabusItem[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (line.length < 6 || line.length > 300) continue;
    const type = TYPE_WORDS.find(([, pattern]) => pattern.test(line))?.[0];
    if (!type) continue;
    const found = findDate(line, today);
    if (!found) continue;
    const title = line.replace(found.match, ' ')
      .replace(/\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day)?\.?,?/gi, ' ')
      .replace(/\b(due|on|by)\s*[:\-–]?\s*$/i, '')
      .replace(/^\s*(week|wk|module|unit)\s*\d+\s*[:\-–.]?\s*/i, '')
      .replace(/^[\s\-–—:•|,.]+|[\s\-–—:•|,.]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 160);
    if (!title) continue;
    const pointsMatch = line.match(/\((\d{1,4}(?:\.\d+)?)\s*(?:pts?|points)\)|\b(\d{1,4}(?:\.\d+)?)\s*(?:pts?|points)\b/i);
    const points = pointsMatch ? Number(pointsMatch[1] ?? pointsMatch[2]) : undefined;
    const key = `${found.date}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title, date: found.date, type, ...(points && points > 0 ? { points } : {}) });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 200);
}
