import { AcademicState, stateSchema } from './model';
import { demoState } from './demo';

export const WORKSPACE_KEY = 'classsync-workspace-v2';
export const LEGACY_KEY = 'classsync-workspace-v1';

// Keep the legacy key as a recovery copy. Backup and cloud entry points use the
// same schema defaults, so unversioned/v1 workspaces migrate without data loss.
export function migrateWorkspace(value: unknown): AcademicState {
  return stateSchema.parse(value);
}

export function syncDemo(current: AcademicState): AcademicState {
  const seed = demoState();
  const appendMissing = <T extends { id: string }>(existing: T[], incoming: T[]) => {
    const ids = new Set(existing.map(item => item.id));
    return [...existing, ...incoming.filter(item => !ids.has(item.id))];
  };
  return stateSchema.parse({
    ...current,
    courses: appendMissing(current.courses, seed.courses),
    assignments: appendMissing(current.assignments, seed.assignments).filter(a => {
      const course = current.courses.find(c => c.id === a.courseId);
      return !course || current.assignments.some(old => old.id === a.id) || course.categories.some(cat => cat.name === a.category);
    }),
    materials: appendMissing(current.materials, seed.materials),
    announcements: appendMissing(current.announcements, seed.announcements).map(a => {
      const updated = seed.announcements.find(item => item.id === a.id);
      return updated ? { ...updated, read: a.read } : a;
    }),
  });
}
