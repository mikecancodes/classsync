import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryBreakdown, projectedGrade, requiredAverage, weightTotal, weightsValid } from '../src/lib/grade-math';
import { Assignment, Course, grade } from '../src/lib/model';

const course: Course = { id: 'c', code: 'BIO 1', name: 'Biology', professor: '', schedule: '', color: 'blue', syllabus: '', categories: [{ name: 'Labs', weight: 40 }, { name: 'Exams', weight: 60 }] };
const item = (id: string, category: string, points: number, earned: number | null): Assignment => ({ id, courseId: 'c', title: id, due: '2026-10-01', status: earned === null ? 'todo' : 'done', category, points, earned, description: '' });
const assignments = [item('lab1', 'Labs', 20, 18), item('lab2', 'Labs', 20, 16), item('lab3', 'Labs', 20, null), item('mid', 'Exams', 100, 80), item('final', 'Exams', 100, null)];

test('breakdown matches the existing grade() math', () => {
  const rows = categoryBreakdown(course, assignments);
  assert.deepEqual(rows.map(r => [r.name, r.average, r.graded, r.ungraded, r.ungradedPoints]), [['Labs', 85, 2, 1, 20], ['Exams', 80, 1, 1, 100]]);
  const current = grade(course, assignments).current!;
  assert.equal(current, 82);
  const contributions = rows.reduce((sum, r) => sum + (r.contribution ?? 0), 0);
  assert.ok(Math.abs(contributions - current) < 1e-9, 'contributions add up to the current grade');
});

test('projection assumes the same score on everything left', () => {
  // Labs: (34 + 20p)/60, Exams: (80 + 100p)/200
  const close = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  close(projectedGrade(course, assignments, 100), 0.4 * (54 / 60) * 100 + 0.6 * (180 / 200) * 100);
  close(projectedGrade(course, assignments, 0), 0.4 * (34 / 60) * 100 + 0.6 * (80 / 200) * 100);
});

test('required average for a target, plus secured/unreachable/nothing-left cases', () => {
  const need = requiredAverage(course, assignments, 85);
  assert.equal(need.status, 'reachable');
  if (need.status === 'reachable') assert.ok(Math.abs(projectedGrade(course, assignments, need.needed)! - 85) < 1e-9, 'solving back gives the target');
  assert.equal(requiredAverage(course, assignments, 40).status, 'secured');
  const top = requiredAverage(course, assignments, 99);
  assert.equal(top.status, 'unreachable');
  if (top.status === 'unreachable') assert.equal(top.best.toFixed(1), '90.0');
  const allGraded = assignments.map(a => a.earned === null ? { ...a, earned: a.points } : a);
  assert.equal(requiredAverage(course, allGraded, 90).status, 'nothing-left');
});

test('empty categories count as remaining work at the assumed score', () => {
  const withEmpty: Course = { ...course, categories: [...course.categories.map(c => ({ ...c, weight: c.weight / 2 })), { name: 'Project', weight: 50 }] };
  assert.equal(projectedGrade(withEmpty, assignments, 0)! < projectedGrade(withEmpty, assignments, 100)!, true);
  assert.equal(weightTotal(withEmpty), 100);
  assert.equal(weightsValid({ ...course, categories: [{ name: 'Labs', weight: 40 }] }), false);
});
