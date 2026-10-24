import { z } from 'zod';
import { AcademicState, Assignment, Course, stateSchema } from './model';

type Announcement = AcademicState['announcements'][number];

// Merges data from the D2L extension into the workspace (decision 2). Records are matched
// by their stable d2l-… IDs, so importing twice never duplicates anything. D2L owns titles,
// dates and descriptions; the student owns completion, scores, read state and course setup.

// A course syllabus file the extension found in D2L Content (scanned for dates on review)
export const syllabusFileSchema = z.object({
  courseId: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  fileName: z.string().min(1).max(200),
  // text/plain: a D2L Content page or the Course Overview, converted to text by the extension
  mimeType: z.enum(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']),
  base64: z.string().min(1).max(12_000_000),
});
export type SyllabusFile = z.infer<typeof syllabusFileSchema>;

// What the extension checked while looking for each class's syllabus (shown when none is found)
export const syllabusSearchSchema = z.object({
  courseId: z.string().min(1).max(100),
  checked: z.number().int().min(0).max(100000),
  chosen: z.string().max(200).nullable(),
  candidates: z.array(z.object({ title: z.string().max(200), where: z.string().max(300), kind: z.string().max(20), score: z.number() })).max(8),
});
export type SyllabusSearch = z.infer<typeof syllabusSearchSchema>;

export const importPayloadSchema = z.object({ version: z.literal(1), source: z.literal('d2l'), data: stateSchema, syllabi: z.array(syllabusFileSchema).max(50).default([]), syllabusSearch: z.array(syllabusSearchSchema).max(50).default([]) });

// A course still has the single default bucket an earlier import created, so D2L's weights
// can replace it; categories the student set up themselves are never overwritten
const isDefaultCategories = (course: Course) => course.categories.length === 1 && course.categories[0].name === 'Coursework' && course.categories[0].weight === 100;

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
    if (existing) courses.set(course.id, { ...existing, name: course.name, code: course.code, categories: isDefaultCategories(existing) && !isDefaultCategories(course) ? course.categories : existing.categories });
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
    // Until the student enters a score, D2L's points and category stay current
    const points = existing.earned === null ? item.points : existing.points;
    const earned = existing.earned ?? (item.earned !== null && item.earned <= points ? item.earned : null);
    const status = existing.status === 'todo' && item.status === 'done' ? 'done' : existing.status;
    const course = courses.get(item.courseId);
    const category = existing.earned === null && course?.categories.some(c => c.name === item.category) ? item.category : existing.category;
    const merged: Assignment = { ...existing, title: item.title, due: item.due, description: item.description, points, earned, status, category };
    if (!course?.categories.some(c => c.name === merged.category)) ensureCategory(item.courseId, merged.category);
    const changed = (['title', 'due', 'description', 'points', 'earned', 'status', 'category'] as const).some(key => merged[key] !== existing[key]);
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

// Removes everything a D2L import created (classes with d2l- IDs and all their
// assignments, announcements and materials) so sync can be tested from scratch.
// Classes the student added themselves are untouched.
export function removeImported(state: AcademicState) {
  const imported = new Set(state.courses.filter(c => c.id.startsWith('d2l-')).map(c => c.id));
  const removedMaterials = state.materials.filter(m => imported.has(m.courseId));
  const next: AcademicState = {
    ...state,
    courses: state.courses.filter(c => !imported.has(c.id)),
    assignments: state.assignments.filter(a => !imported.has(a.courseId)),
    announcements: state.announcements.filter(a => !imported.has(a.courseId)),
    materials: state.materials.filter(m => !imported.has(m.courseId)),
  };
  return {
    state: next,
    materialIds: removedMaterials.map(m => m.id),
    counts: {
      courses: imported.size,
      assignments: state.assignments.length - next.assignments.length,
      announcements: state.announcements.length - next.announcements.length,
      materials: removedMaterials.length,
    },
  };
}
