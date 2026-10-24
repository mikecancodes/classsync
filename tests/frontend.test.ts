import test from 'node:test';
import assert from 'node:assert/strict';
import { testState } from './fixtures';
import { migrateWorkspace } from '../src/lib/workspace';
import { answerAcademicQuestion, dueSoon, shiftDate } from '../src/lib/academic-assistant';
import { stateSchema } from '../src/lib/model';

test('migration starts empty for the old seeded workspace and rejects future versions', () => {
  const legacy = { ...testState(), version: 1 as const };
  const migrated = migrateWorkspace(legacy);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.courses, []);
  assert.deepEqual(migrated.assignments, []);
  assert.deepEqual(migrated.materials, []);
  assert.deepEqual(migrated.announcements, []);
  assert.throws(() => migrateWorkspace({ ...legacy, version: 3 }));
  assert.throws(() => migrateWorkspace({ ...legacy, unknownFutureData: [] }));
});

test('migration removes seeded sample data and preserves student-created coursework', () => {
  const state = testState();
  state.courses.push({ ...state.courses[0], id: 'my-course', code: 'BIO 110', name: 'Biology' });
  state.assignments.push({ ...state.assignments[0], id: 'my-work', courseId: 'my-course', title: 'My lab' });
  state.materials.push({ ...state.materials[0], id: 'my-notes', courseId: 'my-course', title: 'My notes' });
  state.announcements.push({ ...state.announcements[0], id: 'my-announcement', courseId: 'my-course', title: 'My update' });
  const migrated = migrateWorkspace(state);
  assert.deepEqual(migrated.courses.map(course => course.id), ['my-course']);
  assert.deepEqual(migrated.assignments.map(item => item.id), ['my-work']);
  assert.deepEqual(migrated.materials.map(item => item.id), ['my-notes']);
  assert.deepEqual(migrated.announcements.map(item => item.id), ['my-announcement']);
});

test('read status and course references are validated', () => {
  const state = testState();
  state.announcements[0].courseId = 'missing-course';
  assert.equal(stateSchema.safeParse(state).success, false);
});

test('migration removes every original generated class without matching real courses by name', () => {
  const state = testState();
  const original = state.courses[0];
  for (const id of ['math210', 'psych101', 'eng102']) {
    state.courses.push({ ...original, id });
    state.assignments.push({ ...state.assignments[0], id: `old-${id}`, courseId: id });
    state.materials.push({ ...state.materials[0], id: `old-note-${id}`, courseId: id });
  }
  state.courses.push({ ...original, id: 'student-course', name: 'Linear Algebra' });
  const migrated = migrateWorkspace(state);
  assert.deepEqual(migrated.courses.map(course => course.id), ['student-course']);
  assert.deepEqual(migrated.assignments, []);
  assert.deepEqual(migrated.materials, []);
  assert.deepEqual(migrateWorkspace(migrated), migrated);
});

test('due-soon window includes today and day 7, excludes completed and outside dates', () => {
  const base = testState().assignments[0];
  const rows = [-1, 0, 1, 7, 8].map(day => ({ ...base, id: String(day), due: shiftDate('2026-12-31', day) }));
  rows.push({ ...base, id: 'done', status: 'done', due: '2027-01-01' });
  assert.deepEqual(dueSoon(rows, '2026-12-31').map(a => a.id), ['0', '1', '7']);
  assert.equal(shiftDate('2028-02-28', 1), '2028-02-29');
});

test('chat uses current state for tomorrow, missing work, courses, and study suggestions', () => {
  const state = testState();
  state.assignments[0].due = '2027-01-01';
  state.assignments[1].due = '2026-12-30';
  const tomorrow = answerAcademicQuestion('What assignments are due tomorrow?', state, '2026-12-31');
  assert.match(tomorrow, /Socket Programming Lab/);
  state.assignments[0].status = 'done';
  assert.doesNotMatch(answerAcademicQuestion('What assignments are due tomorrow?', state, '2026-12-31'), /Socket Programming Lab/);
  assert.match(answerAcademicQuestion('What assignments am I missing?', state, '2026-12-31'), /Priority Queue Assignment/);
  assert.doesNotMatch(answerAcademicQuestion('What assignments do I have for Computer Networks?', state, '2026-12-31'), /Priority Queue Assignment/);
  assert.match(answerAcademicQuestion('Help me organize my study schedule.', state), /deadline-based suggestion/);
  assert.match(answerAcademicQuestion('What should I work on today?', state), /Start here today/);
  assert.match(answerAcademicQuestion('What do I have due this week?', state), /next seven days/);
});

test('chat clarifies ambiguous or unknown courses and handles unsupported questions and empty work', () => {
  const state = testState();
  assert.match(answerAcademicQuestion('Assignments for Computer Networks and Data Structures?', state), /Which course/);
  assert.match(answerAcademicQuestion('Assignments for chemistry?', state), /couldn’t identify/);
  assert.match(answerAcademicQuestion('Write me a poem', state), /rules, not a live AI/);
  state.assignments.forEach(a => a.status = 'done');
  assert.match(answerAcademicQuestion('What do I have due tomorrow?', state), /No incomplete assignments/);
});
