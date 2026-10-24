import test from 'node:test';
import assert from 'node:assert/strict';
import { demoState } from '../src/lib/demo';
import { migrateWorkspace, syncDemo } from '../src/lib/workspace';
import { answerAcademicQuestion, dueSoon, shiftDate } from '../src/lib/academic-assistant';
import { stateSchema } from '../src/lib/model';

test('migration preserves legacy coursework, notes, and grades and rejects future versions', () => {
  const { version, announcements, ...legacy } = demoState();
  const migrated = migrateWorkspace(legacy);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.assignments, legacy.assignments);
  assert.deepEqual(migrated.materials, legacy.materials);
  assert.deepEqual(migrated.announcements, []);
  assert.throws(() => migrateWorkspace({ ...legacy, version: 3 }));
  assert.throws(() => migrateWorkspace({ ...legacy, unknownFutureData: [] }));
});

test('demo sync is idempotent and preserves edits, scores, notes, and announcement reads', () => {
  const state = demoState();
  state.assignments[0] = { ...state.assignments[0], title: 'My edited lab', status: 'done', earned: 90, due: '2027-02-10' };
  state.materials[0].text = 'My private notes, never replaced by sync.';
  state.announcements[0].read = true;
  state.assignments.push({ ...state.assignments[1], id: 'manual-work', title: 'My own assignment' });
  const once = syncDemo(state);
  const twice = syncDemo(once);
  assert.deepEqual(once, twice);
  assert.deepEqual(once.assignments, state.assignments);
  assert.deepEqual(once.materials, state.materials);
  assert.equal(once.announcements[0].read, true);
  assert.deepEqual(stateSchema.parse(JSON.parse(JSON.stringify(once))), once);
});

test('read status and course references are validated', () => {
  const state = demoState();
  state.announcements[0].courseId = 'missing-course';
  assert.equal(stateSchema.safeParse(state).success, false);
});

test('due-soon window includes today and day 7, excludes completed and outside dates', () => {
  const base = demoState().assignments[0];
  const rows = [-1, 0, 1, 7, 8].map(day => ({ ...base, id: String(day), due: shiftDate('2026-12-31', day) }));
  rows.push({ ...base, id: 'done', status: 'done', due: '2027-01-01' });
  assert.deepEqual(dueSoon(rows, '2026-12-31').map(a => a.id), ['0', '1', '7']);
  assert.equal(shiftDate('2028-02-28', 1), '2028-02-29');
});

test('chat uses current state for tomorrow, missing work, courses, and study suggestions', () => {
  const state = demoState();
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
  const state = demoState();
  assert.match(answerAcademicQuestion('Assignments for Computer Networks and Data Structures?', state), /Which course/);
  assert.match(answerAcademicQuestion('Assignments for chemistry?', state), /couldn’t identify/);
  assert.match(answerAcademicQuestion('Write me a poem', state), /rules, not a live AI/);
  state.assignments.forEach(a => a.status = 'done');
  assert.match(answerAcademicQuestion('What do I have due tomorrow?', state), /No incomplete assignments/);
});
