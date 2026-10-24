import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace } from '../src/lib/workspace';
import { mergeImport } from '../src/lib/d2l-import';
import { AcademicState, stateSchema } from '../src/lib/model';

// Same shape the extension's converter produces (extension/src/to-classsync.js)
function payload(overrides: Partial<AcademicState> = {}) {
  return {
    version: 1, source: 'd2l',
    data: {
      version: 2,
      courses: [{ id: 'd2l-101', code: 'BIO 110', name: 'Intro to Biology', professor: '', schedule: '', color: 'blue', categories: [{ name: 'Coursework', weight: 100 }], syllabus: '' }],
      assignments: [
        { id: 'd2l-dropbox-101-11', courseId: 'd2l-101', title: 'Lab 6', due: '2026-10-30', status: 'todo', category: 'Coursework', points: 20, earned: null, description: 'Complete all parts.' },
        { id: 'd2l-item-101-77', courseId: 'd2l-101', title: 'Quiz 7', due: '2026-11-02', status: 'todo', category: 'Coursework', points: 100, earned: null, description: '' },
      ],
      materials: [],
      announcements: [{ id: 'd2l-news-101-1', courseId: 'd2l-101', platform: 'D2L', title: 'Office hours moved', description: 'Now on Wednesday.', posted: '2026-10-20', read: false }],
      ...overrides,
    },
  };
}

test('first import adds classes, assignments and announcements', () => {
  const { state, summary } = mergeImport(emptyWorkspace(), payload());
  assert.deepEqual(summary.newCourses, ['Intro to Biology']);
  assert.deepEqual(summary.newAssignments, ['Lab 6', 'Quiz 7']);
  assert.deepEqual(summary.newAnnouncements, ['Office hours moved']);
  assert.equal(state.assignments.length, 2);
});

test('importing twice creates no duplicates and reports nothing new', () => {
  const first = mergeImport(emptyWorkspace(), payload()).state;
  const { state, summary } = mergeImport(first, payload());
  assert.equal(state.courses.length, 1);
  assert.equal(state.assignments.length, 2);
  assert.equal(state.announcements.length, 1);
  assert.deepEqual([summary.newCourses.length, summary.newAssignments.length, summary.updatedAssignments.length, summary.newAnnouncements.length], [0, 0, 0, 0]);
  assert.equal(summary.unchanged, 2);
});

test("keeps the student's completion, scores, read state and class setup", () => {
  const first = mergeImport(emptyWorkspace(), payload()).state;
  const edited: AcademicState = {
    ...first,
    courses: first.courses.map(c => ({ ...c, color: 'green', professor: 'Dr. Rivera', categories: [{ name: 'Labs', weight: 40 }, { name: 'Coursework', weight: 60 }] })),
    assignments: first.assignments.map(a => a.id === 'd2l-dropbox-101-11' ? { ...a, status: 'done', earned: 18 } : a),
    announcements: first.announcements.map(a => ({ ...a, read: true })),
  };
  const next = payload();
  next.data.assignments[0] = { ...next.data.assignments[0], title: 'Lab 6 (revised)', due: '2026-10-31', status: 'todo' };
  const { state, summary } = mergeImport(edited, next);
  const lab = state.assignments.find(a => a.id === 'd2l-dropbox-101-11')!;
  assert.deepEqual([lab.title, lab.due, lab.status, lab.earned], ['Lab 6 (revised)', '2026-10-31', 'done', 18]);
  assert.deepEqual(summary.updatedAssignments, ['Lab 6 (revised)']);
  const course = state.courses[0];
  assert.deepEqual([course.color, course.professor, course.categories.length], ['green', 'Dr. Rivera', 2]);
  assert.equal(state.announcements[0].read, true);
});

test('D2L completion and scores fill in when the student has none', () => {
  const first = mergeImport(emptyWorkspace(), payload()).state;
  const next = payload();
  next.data.assignments[0] = { ...next.data.assignments[0], status: 'done', earned: 17 };
  const lab = mergeImport(first, next).state.assignments.find(a => a.id === 'd2l-dropbox-101-11')!;
  assert.deepEqual([lab.status, lab.earned], ['done', 17]);
});

test('adds a missing category at weight 0 without changing grade weights', () => {
  const first = mergeImport(emptyWorkspace(), payload()).state;
  const renamed: AcademicState = { ...first, courses: first.courses.map(c => ({ ...c, categories: [{ name: 'Labs', weight: 100 }] })), assignments: first.assignments.map(a => ({ ...a, category: 'Labs' })) };
  const next = payload();
  next.data.assignments.push({ id: 'd2l-item-101-90', courseId: 'd2l-101', title: 'Discussion 3', due: '2026-11-05', status: 'todo', category: 'Coursework', points: 100, earned: null, description: '' });
  const { state } = mergeImport(renamed, next);
  assert.deepEqual(state.courses[0].categories, [{ name: 'Labs', weight: 100 }, { name: 'Coursework', weight: 0 }]);
});

test('never deletes manual work, and rejects bad payloads without changes', () => {
  const manual: AcademicState = { ...emptyWorkspace(), courses: [{ id: 'my-course', code: 'ART 100', name: 'Drawing', professor: '', schedule: '', color: 'orange', categories: [{ name: 'Projects', weight: 100 }], syllabus: '' }] };
  const { state } = mergeImport(manual, payload());
  assert.ok(state.courses.some(c => c.id === 'my-course'));
  assert.throws(() => mergeImport(manual, { version: 1, source: 'canvas', data: payload().data }));
  assert.throws(() => mergeImport(manual, { ...payload(), data: { ...payload().data, courses: [] } }), 'assignment course must exist');
  assert.equal(manual.courses.length, 1);
});

test("D2L grade weights replace the default bucket but never the student's own categories", () => {
  const first = mergeImport(emptyWorkspace(), payload()).state;
  const weighted = payload();
  weighted.data.courses[0] = { ...weighted.data.courses[0], categories: [{ name: 'Labs', weight: 40 }, { name: 'Exams', weight: 60 }, { name: 'Coursework', weight: 0 }] };
  weighted.data.assignments[0] = { ...weighted.data.assignments[0], category: 'Labs' };
  const updated = mergeImport(first, weighted).state;
  assert.deepEqual(updated.courses[0].categories.map(c => c.name), ['Labs', 'Exams', 'Coursework']);
  assert.equal(updated.assignments.find(a => a.id === 'd2l-dropbox-101-11')!.category, 'Labs', 'ungraded items follow D2L categories');

  const custom: AcademicState = { ...first, courses: first.courses.map(c => ({ ...c, categories: [{ name: 'Mine', weight: 100 }, { name: 'Coursework', weight: 0 }] })) };
  const kept = mergeImport(custom, weighted).state;
  assert.deepEqual(kept.courses[0].categories.map(c => c.name), ['Mine', 'Coursework'], 'custom categories kept');
  assert.equal(kept.assignments.find(a => a.id === 'd2l-dropbox-101-11')!.category, 'Coursework', 'keeps its valid category');
});

test('points follow D2L until the student enters a score', () => {
  const first = mergeImport(emptyWorkspace(), payload()).state;
  const next = payload();
  next.data.assignments[1] = { ...next.data.assignments[1], points: 15 };
  assert.equal(mergeImport(first, next).state.assignments.find(a => a.id === 'd2l-item-101-77')!.points, 15);
  const scored: AcademicState = { ...first, assignments: first.assignments.map(a => a.id === 'd2l-item-101-77' ? { ...a, earned: 80 } : a) };
  assert.equal(mergeImport(scored, next).state.assignments.find(a => a.id === 'd2l-item-101-77')!.points, 100);
});

test('syllabus files ride along with the payload', async () => {
  const { importPayloadSchema } = await import('../src/lib/d2l-import');
  const parsed = importPayloadSchema.parse({ ...payload(), syllabi: [{ courseId: 'd2l-101', title: 'Syllabus', fileName: 'syllabus.pdf', mimeType: 'application/pdf', base64: 'JVBERi0=' }] });
  assert.equal(parsed.syllabi.length, 1);
  assert.deepEqual(importPayloadSchema.parse(payload()).syllabi, []);
  assert.throws(() => importPayloadSchema.parse({ ...payload(), syllabi: [{ courseId: 'x', title: 'S', fileName: 's.exe', mimeType: 'application/x-msdownload', base64: 'x' }] }));
});

test('unsync removes only D2L-imported classes and everything attached to them', async () => {
  const { removeImported } = await import('../src/lib/d2l-import');
  const imported = mergeImport(emptyWorkspace(), payload()).state;
  const mine = { id: 'my-course', code: 'ART 100', name: 'Drawing', professor: '', schedule: '', color: 'orange' as const, categories: [{ name: 'Projects', weight: 100 }], syllabus: '' };
  const state: AcademicState = {
    ...imported,
    courses: [...imported.courses, mine],
    assignments: [...imported.assignments, { id: 'sketch', courseId: 'my-course', title: 'Sketchbook', due: '2026-11-01', status: 'todo', category: 'Projects', points: 10, earned: null, description: '' }],
    materials: [{ id: 'd2l-syllabus-d2l-101', courseId: 'd2l-101', title: 'Syllabus', text: '', kind: 'material' }, { id: 'my-notes', courseId: 'my-course', title: 'Notes', text: 'x', kind: 'notes' }],
  };
  const { state: next, counts, materialIds } = removeImported(state);
  assert.deepEqual(next.courses.map(c => c.id), ['my-course']);
  assert.deepEqual(next.assignments.map(a => a.id), ['sketch']);
  assert.deepEqual(next.materials.map(m => m.id), ['my-notes']);
  assert.equal(next.announcements.length, 0);
  assert.deepEqual(counts, { courses: 1, assignments: 2, announcements: 1, materials: 1 });
  assert.deepEqual(materialIds, ['d2l-syllabus-d2l-101']);
  assert.ok(stateSchema.safeParse(next).success);
  assert.equal(mergeImport(next, payload()).summary.newCourses.length, 1, 'next sync imports it again as new');
});
