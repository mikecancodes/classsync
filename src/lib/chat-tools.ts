import type { FunctionDeclaration } from '@google/genai';
import { AcademicState, Assignment, Course, dateKey, grade, letter } from './model';
import { shiftDate } from './academic-assistant';

// Read-only lookups the Gemini chat can request. They run in the browser against the
// student's current workspace, so the model only ever sees the rows it asked for.

export const MAX_ROWS = 25;
const DESCRIPTION_LIMIT = 300;

type Args = Record<string, unknown>;
export type ToolResult = Record<string, unknown>;

export const chatToolDeclarations: FunctionDeclaration[] = [
  {
    name: 'list_courses',
    description: "List the student's courses with instructor, number of incomplete assignments, and current grade.",
    parametersJsonSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_course_context',
    description: 'Get a useful overview of one course, including its instructor and schedule, syllabus excerpt, current grade, next incomplete assignments, recent announcements, and saved material titles. Use for broad or open-ended questions about what is happening in a particular class. For details inside notes or materials, also use search_notes.',
    parametersJsonSchema: { type: 'object', properties: { course: { type: 'string', description: 'Course name or code' } }, required: ['course'] },
  },
  {
    name: 'get_assignments',
    description: 'Look up assignments. Use for anything about deadlines, what is due, missing or overdue work, or work for a course. Dates are YYYY-MM-DD in the student\'s local calendar.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Earliest due date to include, YYYY-MM-DD' },
        to: { type: 'string', description: 'Latest due date to include, YYYY-MM-DD' },
        course: { type: 'string', description: 'Course name or code, e.g. "networks" or "CS 201"' },
        status: { type: 'string', enum: ['incomplete', 'done', 'all'], description: 'Defaults to incomplete' },
        overdue_only: { type: 'boolean', description: 'Only incomplete work whose due date has passed ("missing" work)' },
      },
    },
  },
  {
    name: 'get_announcements',
    description: 'Look up course announcements, newest first.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        course: { type: 'string', description: 'Course name or code' },
        unread_only: { type: 'boolean' },
        limit: { type: 'integer', description: 'How many to return, 1-25. Defaults to 10' },
      },
    },
  },
  {
    name: 'get_grades',
    description: 'Current calculated grade per course and the graded items behind it. Grades are calculated by ClassSync from entered scores, not official records.',
    parametersJsonSchema: { type: 'object', properties: { course: { type: 'string', description: 'Course name or code' } } },
  },
  {
    name: 'search_notes',
    description: "Keyword search across the student's lecture notes, course materials, announcements, and syllabi. Use for questions about course content or policies.",
    parametersJsonSchema: { type: 'object', properties: { query: { type: 'string', description: 'A few keywords' } }, required: ['query'] },
  },
  {
    name: 'suggest_study_order',
    description: 'Incomplete work in a suggested order: overdue first, then nearest deadline, grouped by due date. Use for "what should I work on" or planning questions.',
    parametersJsonSchema: { type: 'object', properties: { days: { type: 'integer', description: 'How many days ahead to include, 1-14. Defaults to 7' } } },
  },
];

const statusLabels: Record<string, string> = {
  list_courses: 'Looking at your courses…',
  get_course_context: 'Getting your course context…',
  get_assignments: 'Checking your assignments…',
  get_announcements: 'Reading announcements…',
  get_grades: 'Checking your grades…',
  search_notes: 'Searching your notes…',
  suggest_study_order: 'Putting together a plan…',
};
export const toolStatusLabel = (name: string) => statusLabels[name] ?? 'Looking that up…';

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (text: string, max = DESCRIPTION_LIMIT) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

class ToolInputError extends Error {}

function optionalString(args: Args, key: string) {
  const value = args[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new ToolInputError(`${key} must be text`);
  return value;
}

function optionalDate(args: Args, key: string) {
  const value = optionalString(args, key);
  if (value !== undefined && !isDate(value)) throw new ToolInputError(`${key} must be a date like 2026-10-24`);
  return value;
}

function optionalInteger(args: Args, key: string, min: number, max: number, fallback: number) {
  const value = args[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ToolInputError(`${key} must be a number`);
  return Math.min(max, Math.max(min, Math.round(value)));
}

// Exact name/code match wins; otherwise a unique partial match. Ambiguity is returned to
// the model so it can ask the student which course they meant.
function resolveCourse(state: AcademicState, query: string | undefined): { course?: Course; error?: ToolResult } {
  if (!query) return {};
  const q = normalize(query);
  const exact = state.courses.filter(c => normalize(c.name) === q || normalize(c.code) === q);
  if (exact.length === 1) return { course: exact[0] };
  const partial = state.courses.filter(c => normalize(c.name).includes(q) || normalize(c.code).includes(q) || q.includes(normalize(c.name)));
  if (partial.length === 1) return { course: partial[0] };
  const options = (partial.length ? partial : state.courses).map(c => `${c.name} (${c.code})`);
  return { error: { error: partial.length ? 'ambiguous_course' : 'course_not_found', query, options } };
}

const courseName = (state: AcademicState, id: string) => state.courses.find(c => c.id === id)?.name ?? 'Unknown course';
const byDue = (a: Assignment, b: Assignment) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title);

function assignmentRow(state: AcademicState, a: Assignment, today: string) {
  return {
    title: a.title,
    course: courseName(state, a.courseId),
    due: a.due,
    status: a.status,
    overdue: a.status !== 'done' && a.due < today,
    points: a.points,
    earned: a.earned,
    description: clip(a.description),
  };
}

function listCourses(state: AcademicState) {
  return {
    count: state.courses.length,
    courses: state.courses.slice(0, MAX_ROWS).map(c => {
      const current = grade(c, state.assignments).current;
      return {
        name: c.name,
        code: c.code,
        professor: c.professor || null,
        incompleteAssignments: state.assignments.filter(a => a.courseId === c.id && a.status !== 'done').length,
        currentGrade: current === null ? null : Math.round(current * 10) / 10,
        letter: current === null ? null : letter(current),
      };
    }),
  };
}

function getCourseContext(state: AcademicState, args: Args, today: string) {
  const query = optionalString(args, 'course');
  if (!query) throw new ToolInputError('course is required');
  const { course, error } = resolveCourse(state, query);
  if (error) return error;
  if (!course) return { error: 'course_not_found', query, options: [] };

  const incomplete = state.assignments
    .filter(a => a.courseId === course.id && a.status !== 'done')
    .sort(byDue);
  const announcements = state.announcements
    .filter(a => a.courseId === course.id)
    .sort((a, b) => b.posted.localeCompare(a.posted));
  const current = grade(course, state.assignments).current;

  return {
    today,
    course: {
      name: course.name,
      code: course.code,
      professor: course.professor || null,
      schedule: course.schedule || null,
      currentGrade: current === null ? null : Math.round(current * 10) / 10,
      letter: current === null ? null : letter(current),
      syllabusExcerpt: course.syllabus.trim() ? clip(course.syllabus.trim(), 1800) : null,
    },
    incompleteAssignmentCount: incomplete.length,
    nextAssignments: incomplete.slice(0, 10).map(a => assignmentRow(state, a, today)),
    assignmentsTruncated: incomplete.length > 10,
    recentAnnouncements: announcements.slice(0, 5).map(a => ({
      title: a.title,
      posted: a.posted,
      priority: a.priority ?? null,
      read: a.read,
      description: clip(a.description),
    })),
    announcementsTruncated: announcements.length > 5,
    savedMaterials: state.materials.filter(m => m.courseId === course.id).slice(0, 20).map(m => ({
      kind: m.kind,
      title: m.title,
    })),
    materialsTruncated: state.materials.filter(m => m.courseId === course.id).length > 20,
  };
}

function getAssignments(state: AcademicState, args: Args, today: string) {
  const from = optionalDate(args, 'from'), to = optionalDate(args, 'to');
  const status = optionalString(args, 'status') ?? 'incomplete';
  if (!['incomplete', 'done', 'all'].includes(status)) throw new ToolInputError('status must be incomplete, done, or all');
  const { course, error } = resolveCourse(state, optionalString(args, 'course'));
  if (error) return error;
  const overdueOnly = args.overdue_only === true;
  const rows = state.assignments
    .filter(a => !course || a.courseId === course.id)
    .filter(a => status === 'all' || (status === 'done' ? a.status === 'done' : a.status !== 'done'))
    .filter(a => !overdueOnly || (a.status !== 'done' && a.due < today))
    .filter(a => (!from || a.due >= from) && (!to || a.due <= to))
    .sort(byDue);
  return {
    today,
    course: course?.name ?? null,
    count: rows.length,
    truncated: rows.length > MAX_ROWS,
    assignments: rows.slice(0, MAX_ROWS).map(a => assignmentRow(state, a, today)),
  };
}

function getAnnouncements(state: AcademicState, args: Args) {
  const { course, error } = resolveCourse(state, optionalString(args, 'course'));
  if (error) return error;
  const limit = optionalInteger(args, 'limit', 1, MAX_ROWS, 10);
  const rows = state.announcements
    .filter(a => !course || a.courseId === course.id)
    .filter(a => args.unread_only !== true || !a.read)
    .sort((a, b) => b.posted.localeCompare(a.posted));
  return {
    count: rows.length,
    announcements: rows.slice(0, limit).map(a => ({
      title: a.title,
      course: courseName(state, a.courseId),
      platform: a.platform,
      posted: a.posted,
      priority: a.priority ?? null,
      read: a.read,
      description: clip(a.description),
    })),
  };
}

function getGrades(state: AcademicState, args: Args) {
  const { course, error } = resolveCourse(state, optionalString(args, 'course'));
  if (error) return error;
  const courses = course ? [course] : state.courses.slice(0, MAX_ROWS);
  return {
    note: 'Calculated from scores entered in ClassSync. Not an official grade.',
    courses: courses.map(c => {
      const current = grade(c, state.assignments).current;
      return {
        course: c.name,
        code: c.code,
        currentGrade: current === null ? null : Math.round(current * 10) / 10,
        letter: current === null ? null : letter(current),
        gradedItems: state.assignments
          .filter(a => a.courseId === c.id && a.earned !== null)
          .sort(byDue)
          .slice(0, MAX_ROWS)
          .map(a => ({ title: a.title, category: a.category, earned: a.earned, points: a.points, due: a.due })),
      };
    }),
  };
}

function snippet(text: string, term: string) {
  const at = text.toLowerCase().indexOf(term);
  const start = Math.max(0, at - 120);
  return `${start > 0 ? '…' : ''}${text.slice(start, start + DESCRIPTION_LIMIT).trim()}${start + DESCRIPTION_LIMIT < text.length ? '…' : ''}`;
}

function searchNotes(state: AcademicState, args: Args) {
  const query = optionalString(args, 'query');
  if (!query) throw new ToolInputError('query is required');
  const terms = normalize(query).split(' ').filter(t => t.length > 2);
  if (!terms.length) throw new ToolInputError('query needs at least one word longer than two letters');
  const sources = [
    ...state.materials.map(m => ({ kind: m.kind === 'notes' ? 'notes' : 'material', title: m.title, courseId: m.courseId, text: m.text })),
    ...state.announcements.map(a => ({ kind: 'announcement', title: a.title, courseId: a.courseId, text: a.description })),
    ...state.courses.filter(c => c.syllabus.trim()).map(c => ({ kind: 'syllabus', title: `${c.name} syllabus`, courseId: c.id, text: c.syllabus })),
  ];
  const matches = sources
    .map(source => {
      const haystack = `${source.title} ${source.text}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + haystack.split(term).length - 1, 0);
      const firstTerm = terms.find(term => source.text.toLowerCase().includes(term)) ?? terms[0];
      return { ...source, score, firstTerm };
    })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  return {
    query,
    count: matches.length,
    results: matches.map(m => ({ kind: m.kind, title: m.title, course: courseName(state, m.courseId), snippet: snippet(m.text, m.firstTerm) })),
  };
}

function suggestStudyOrder(state: AcademicState, args: Args, today: string) {
  const days = optionalInteger(args, 'days', 1, 14, 7);
  const end = shiftDate(today, days);
  const pending = state.assignments.filter(a => a.status !== 'done' && a.due <= end).sort(byDue);
  const overdue = pending.filter(a => a.due < today);
  const upcoming = pending.filter(a => a.due >= today);
  const byDay = new Map<string, Assignment[]>();
  for (const a of upcoming) byDay.set(a.due, [...(byDay.get(a.due) ?? []), a]);
  return {
    today,
    through: end,
    assumptions: 'Ordered by deadline only: overdue first, then nearest due date. Assignment length and available study time are not known.',
    overdue: overdue.slice(0, MAX_ROWS).map(a => assignmentRow(state, a, today)),
    days: [...byDay.entries()].slice(0, MAX_ROWS).map(([date, items]) => ({ date, items: items.map(a => assignmentRow(state, a, today)) })),
  };
}

export function runTool(name: string, args: unknown, state: AcademicState, today = dateKey()): ToolResult {
  const input: Args = args && typeof args === 'object' && !Array.isArray(args) ? args as Args : {};
  try {
    switch (name) {
      case 'list_courses': return listCourses(state);
      case 'get_course_context': return getCourseContext(state, input, today);
      case 'get_assignments': return getAssignments(state, input, today);
      case 'get_announcements': return getAnnouncements(state, input);
      case 'get_grades': return getGrades(state, input);
      case 'search_notes': return searchNotes(state, input);
      case 'suggest_study_order': return suggestStudyOrder(state, input, today);
      default: return { error: 'unknown_tool', name };
    }
  } catch (err) {
    return { error: err instanceof ToolInputError ? err.message : 'lookup_failed' };
  }
}
