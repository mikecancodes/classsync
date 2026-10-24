import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWeightPlan, matchCategory, needsWeights, planWeights } from '../src/lib/syllabus-weights';
import { parseSyllabusWeights } from '../src/lib/syllabus';
import { AcademicState, Assignment, stateSchema } from '../src/lib/model';
import { findSyllabusWeights } from '../src/lib/syllabus-rules';
import { emptyWorkspace } from '../src/lib/workspace';

const weights = [{ name: 'Exams', weight: 45 }, { name: 'Lab Reports', weight: 25 }, { name: 'Homework', weight: 20 }, { name: 'Participation', weight: 10 }];
const item = (id: string, title: string, category = 'Coursework', earned: number | null = null): Assignment => ({ id, courseId: 'bio', title, due: '2026-10-01', status: 'todo', category, points: 100, earned, description: '' });
const state = (): AcademicState => stateSchema.parse({ ...emptyWorkspace(),
  courses: [{ id: 'bio', code: 'BIOL 1107', name: 'Biology', professor: '', schedule: '', color: 'blue', syllabus: '', categories: [{ name: 'Coursework', weight: 100 }] }],
  assignments: [item('a1', 'Midterm Exam', 'Coursework', 80), item('a2', 'Lab Report 3'), item('a3', 'HW 4: Genetics'), item('a4', 'Final'), item('a5', 'Attendance week 5'), item('a6', 'Field trip waiver')],
});

test('assignment titles match the right syllabus category', () => {
  assert.equal(matchCategory('Midterm Exam', weights), 'Exams');
  assert.equal(matchCategory('Final', weights), 'Exams');
  assert.equal(matchCategory('Lab Report 3', weights), 'Lab Reports');
  assert.equal(matchCategory('HW 4: Genetics', weights), 'Homework');
  assert.equal(matchCategory('Attendance week 5', weights), 'Participation');
  assert.equal(matchCategory('Field trip waiver', weights), null);
});

test('plan moves matching assignments and keeps leftovers at 0%', () => {
  const plan = planWeights(state(), 'bio', weights);
  assert.deepEqual(plan.moves.map(m => [m.title, m.to]), [['Midterm Exam', 'Exams'], ['Lab Report 3', 'Lab Reports'], ['HW 4: Genetics', 'Homework'], ['Final', 'Exams'], ['Attendance week 5', 'Participation']]);
  assert.deepEqual(plan.kept, ['Coursework'], 'the waiver still needs a home');
  assert.deepEqual(plan.categories.at(-1), { name: 'Coursework', weight: 0 });
  assert.equal(plan.total, 100);
});

test('applying the plan gives a valid workspace with the syllabus weights', () => {
  const next = applyWeightPlan(state(), 'bio', planWeights(state(), 'bio', weights));
  assert.ok(stateSchema.safeParse(next).success);
  assert.deepEqual(next.courses[0].categories.map(c => [c.name, c.weight]), [['Exams', 45], ['Lab Reports', 25], ['Homework', 20], ['Participation', 10], ['Coursework', 0]]);
  assert.equal(next.assignments.find(a => a.id === 'a1')!.category, 'Exams');
  assert.equal(next.assignments.find(a => a.id === 'a1')!.earned, 80, 'scores untouched');
  assert.equal(needsWeights(next.courses[0]), false);
  assert.equal(needsWeights(state().courses[0]), true);
});

test('weights parse from AI output and from pasted syllabus text', () => {
  assert.deepEqual(parseSyllabusWeights({ weights: [{ name: ' Exams: ', weight: 40 }, { name: 'Labs', weight: '25' }, { name: 'Bad', weight: 0 }, { name: 'Huge', weight: 140 }, { name: '', weight: 10 }, { name: 'labs', weight: 5 }] }),
    [{ name: 'Exams', weight: 40 }, { name: 'Labs', weight: 25 }]);
  assert.deepEqual(parseSyllabusWeights('nope'), []);
  const fromText = parseSyllabusWeights({ weights: findSyllabusWeights('Grading\nExams 45%\nLab Reports - 25%\nHomework: 20%\nParticipation 10 %') });
  assert.deepEqual(fromText.map(w => [w.name, w.weight]), [['Exams', 45], ['Lab Reports', 25], ['Homework', 20], ['Participation', 10]]);
});

test('the syllabus viewer finds D2L, uploaded, or titled syllabus files in that order', async () => {
  const { findSyllabusMaterial } = await import('../src/components/syllabus-viewer');
  const base = state();
  const m = (id: string, title: string) => ({ id, courseId: 'bio', title, text: '', kind: 'material' as const });
  assert.equal(findSyllabusMaterial({ ...base, materials: [m('x', 'Course Syllabus.pdf'), m('syllabus-bio', 'Syllabus · mine.pdf'), m('d2l-syllabus-bio', 'Syllabus · d2l.pdf')] }, 'bio')?.id, 'd2l-syllabus-bio');
  assert.equal(findSyllabusMaterial({ ...base, materials: [m('x', 'Course Syllabus.pdf'), m('syllabus-bio', 'Syllabus · mine.pdf')] }, 'bio')?.id, 'syllabus-bio');
  assert.equal(findSyllabusMaterial({ ...base, materials: [m('notes', 'Week 1 notes'), m('x', 'Course Syllabus.pdf')] }, 'bio')?.id, 'x');
  assert.equal(findSyllabusMaterial({ ...base, materials: [m('notes', 'Week 1 notes')] }, 'bio'), undefined);
});

test('weight finder handles labels, parentheses and several weights per line', () => {
  assert.deepEqual(findSyllabusWeights('Grading: Exams 70%'), [{ name: 'Exams', weight: 70 }]);
  assert.deepEqual(findSyllabusWeights('Homework (20%), Quizzes (10%) and Final Project (30%)'), [{ name: 'Homework', weight: 20 }, { name: 'Quizzes', weight: 10 }, { name: 'Final Project', weight: 30 }]);
  assert.deepEqual(findSyllabusWeights('Total 100%\nYour final grade is 100%'), []);
  assert.deepEqual(findSyllabusWeights('Late work loses 10% per day'), [], 'penalty sentences are not categories');
});

test('the viewer only treats real PDF bytes as a PDF', async () => {
  const { safeBlob } = await import('../src/components/syllabus-viewer');
  const real = await safeBlob(new Blob(['%PDF-1.4 ...'], { type: 'application/pdf' }));
  assert.deepEqual([real.pdf, real.blob.type], [true, 'application/pdf']);
  const disguised = await safeBlob(new Blob(['<html><script>alert(1)</script></html>'], { type: 'application/pdf' }));
  assert.deepEqual([disguised.pdf, disguised.blob.type], [false, 'application/octet-stream'], 'HTML labelled as PDF becomes a download');
  const html = await safeBlob(new Blob(['<svg onload=alert(1)>'], { type: 'image/svg+xml' }));
  assert.equal(html.blob.type, 'application/octet-stream');
});
