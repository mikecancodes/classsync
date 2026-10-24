import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWeightPlan, matchCategory, needsWeights, planWeights } from '../src/lib/syllabus-weights';
import { parseSyllabusWeights } from '../src/lib/syllabus';
import { AcademicState, Assignment, extractWeights, stateSchema } from '../src/lib/model';
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
  const fromText = parseSyllabusWeights({ weights: extractWeights('Grading\nExams 45%\nLab Reports - 25%\nHomework: 20%\nParticipation 10 %') });
  assert.deepEqual(fromText.map(w => [w.name, w.weight]), [['Exams', 45], ['Lab Reports', 25], ['Homework', 20], ['Participation', 10]]);
});
