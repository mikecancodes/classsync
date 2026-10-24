import { AcademicState, stateSchema } from './model';

export const WORKSPACE_KEY = 'classsync-workspace-v2';
export const LEGACY_KEY = 'classsync-workspace-v1';

const seededCourseIds = new Set([
  'demo-networks', 'cs201', 'demo-justice', 'demo-architecture', 'demo-algorithms',
  'math210', 'psych101', 'eng102',
]);

export function emptyWorkspace(): AcademicState {
  return stateSchema.parse({ version: 2, courses: [], assignments: [], materials: [], announcements: [] });
}

// Remove only the records created by the old built-in sample workspace. Keep
// student-created records attached to real courses and preserve other fields.
export function migrateWorkspace(value: unknown): AcademicState {
  const state = stateSchema.parse(value);
  const courses = state.courses.filter(course => !seededCourseIds.has(course.id));
  const retainedCourseIds = new Set(courses.map(course => course.id));

  return stateSchema.parse({
    ...state,
    courses,
    assignments: state.assignments.filter(item => !item.id.startsWith('demo-') && retainedCourseIds.has(item.courseId)),
    materials: state.materials.filter(item => !item.id.startsWith('demo-') && retainedCourseIds.has(item.courseId)),
    announcements: state.announcements.filter(item => !item.id.startsWith('demo-') && retainedCourseIds.has(item.courseId)),
  });
}
