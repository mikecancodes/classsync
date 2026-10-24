import { AcademicState, Assignment, Course } from './model';
import type { SyllabusItem } from './syllabus';

// Turns scanned syllabus items into proposed assignments, flags ones the course already
// has, and adds the ones the student approves.

export type SyllabusProposal = { assignment: Assignment; duplicateOf: string | null };

const PLACEHOLDER_POINTS = 100;
const SYLLABUS_CATEGORY = 'From syllabus';
const words = (text: string) => new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1));
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const daysApart = (a: string, b: string) => Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86400000;

// Same course, due within two days, and most title words shared
function similar(a: string, b: string) {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return false;
  const shared = [...x].filter(w => y.has(w)).length;
  return shared / Math.min(x.size, y.size) >= 0.6;
}

const CATEGORY_HINTS: Record<SyllabusItem['type'], RegExp> = {
  exam: /exam|midterm|final|test/i,
  quiz: /quiz/i,
  project: /project|paper|essay|presentation/i,
  lab: /lab/i,
  discussion: /discussion|forum|participation/i,
  assignment: /assignment|homework|coursework/i,
  reading: /reading/i,
  other: /$^/,
};

// An existing grade category that fits the item, or a weight-0 "From syllabus" bucket
function categoryFor(course: Course, type: SyllabusItem['type']) {
  return course.categories.find(c => CATEGORY_HINTS[type].test(c.name))?.name ?? course.categories.find(c => c.name === SYLLABUS_CATEGORY)?.name ?? SYLLABUS_CATEGORY;
}

export function proposeAssignments(items: SyllabusItem[], course: Course, state: AcademicState, alsoExisting: Assignment[] = []): SyllabusProposal[] {
  const existing = [...state.assignments, ...alsoExisting].filter(a => a.courseId === course.id);
  return items.map(item => {
    const id = `syllabus-${course.id}-${item.date}-${slug(item.title)}`.slice(0, 100);
    const match = existing.find(a => a.id === id || (daysApart(a.due, item.date) <= 2 && similar(a.title, item.title)));
    return {
      duplicateOf: match ? match.title : null,
      assignment: {
        id,
        courseId: course.id,
        title: item.title,
        due: item.date,
        status: 'todo',
        category: categoryFor(course, item.type),
        points: item.points ?? PLACEHOLDER_POINTS,
        earned: null,
        description: item.points ? 'From the course syllabus.' : `From the course syllabus. Points not stated; ${PLACEHOLDER_POINTS} used as a placeholder.`,
      },
    };
  });
}

export function addProposals(state: AcademicState, assignments: Assignment[]): AcademicState {
  const ids = new Set(state.assignments.map(a => a.id));
  const fresh = assignments.filter(a => !ids.has(a.id)).slice(0, Math.max(0, 1000 - state.assignments.length));
  const courses = state.courses.map(course => {
    const needs = fresh.some(a => a.courseId === course.id && !course.categories.some(c => c.name === a.category));
    return needs && course.categories.length < 20 ? { ...course, categories: [...course.categories, { name: SYLLABUS_CATEGORY, weight: 0 }] } : course;
  });
  const valid = fresh.filter(a => courses.find(c => c.id === a.courseId)?.categories.some(c => c.name === a.category));
  return { ...state, courses, assignments: [...state.assignments, ...valid] };
}
