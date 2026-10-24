import { z } from 'zod';
import { AcademicState, Assignment, Course, stateSchema } from './model';

type Announcement = AcademicState['announcements'][number];

// Merges data from the D2L extension into the workspace (decision 2). Records are matched
// by their stable d2l-… IDs, so importing twice never duplicates anything. D2L owns titles,
// dates and descriptions; the student owns completion, scores, read state and course setup.

export const importPayloadSchema = z.object({ version: z.literal(1), source: z.literal('d2l'), data: stateSchema });

export type ImportSummary = {
  newCourses: string[];
  newAssignments: string[];
  updatedAssignments: string[];
  newAnnouncements: string[];
  unchanged: number;
};

export function mergeImport(state: AcademicState, payload: unknown): { state: AcademicState; summary: ImportSummary } {
  const incoming = importPayloadSchema.parse(payload).data;
  const summary: ImportSummary = { newCourses: [], newAssignments: [], updatedAssignments: [], newAnnouncements: [], unchanged: 0 };

  const courses = new Map<string, Course>(state.courses.map(c => [c.id, c]));
  for (const course of incoming.courses) {
    const existing = courses.get(course.id);
    if (existing) courses.set(course.id, { ...existing, name: course.name, code: course.code });
    else { courses.set(course.id, course); summary.newCourses.push(course.name); }
  }

  // An assignment's category must exist on its course; add missing ones at weight 0 so
  // the student's grade weights stay exactly as they set them
  function ensureCategory(courseId: string, category: string) {
    const course = courses.get(courseId);
    if (course && !course.categories.some(c => c.name === category)) courses.set(courseId, { ...course, categories: [...course.categories, { name: category, weight: 0 }] });
  }

  const assignments = new Map<string, Assignment>(state.assignments.map(a => [a.id, a]));
  for (const item of incoming.assignments) {
    const existing = assignments.get(item.id);
    if (!existing) {
      ensureCategory(item.courseId, item.category);
      assignments.set(item.id, item);
      summary.newAssignments.push(item.title);
      continue;
    }
    const earned = existing.earned ?? (item.earned !== null && item.earned <= existing.points ? item.earned : null);
    const status = existing.status === 'todo' && item.status === 'done' ? 'done' : existing.status;
    const merged: Assignment = { ...existing, title: item.title, due: item.due, description: item.description, earned, status };
    const changed = (['title', 'due', 'description', 'earned', 'status'] as const).some(key => merged[key] !== existing[key]);
    assignments.set(item.id, merged);
    if (changed) summary.updatedAssignments.push(item.title); else summary.unchanged++;
  }

  const announcements = new Map<string, Announcement>(state.announcements.map(a => [a.id, a]));
  for (const item of incoming.announcements) {
    const existing = announcements.get(item.id);
    if (existing) announcements.set(item.id, { ...item, read: existing.read, priority: existing.priority ?? item.priority });
    else { announcements.set(item.id, item); summary.newAnnouncements.push(item.title); }
  }

  const materials = [...state.materials];
  for (const item of incoming.materials) if (!materials.some(m => m.id === item.id)) materials.push(item);

  // Throws if the result breaks a limit, so an import is applied completely or not at all
  const merged = stateSchema.parse({
    ...state,
    courses: [...courses.values()],
    assignments: [...assignments.values()],
    announcements: [...announcements.values()],
    materials,
  });
  return { state: merged, summary };
}
