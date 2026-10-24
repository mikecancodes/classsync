import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { stateSchema } from '../../src/lib/model';
import { toImportPayload, localDateKey } from '../src/to-classsync.js';

// Same shape as src/app/api/imports/preview/route.ts
const importSchema = z.object({ version: z.literal(1), source: z.enum(['canvas', 'd2l', 'manual']), data: stateSchema });

const raw = {
  origin: 'https://d2l.example.edu',
  courses: [
    {
      enrollment: { OrgUnit: { Id: 101, Name: 'Intro to Biology', Code: 'BIO-110-01-FALL-2026-LONG-SECTION-CODE' } },
      news: [
        { Id: 1, Title: 'Office hours moved', Body: { Text: 'Now on Wednesday.' }, StartDate: '2026-10-20T14:00:00.000Z', IsHidden: false },
        { Id: 2, Title: 'Draft', Body: { Text: 'hidden' }, StartDate: '2026-10-21T14:00:00.000Z', IsHidden: true },
      ],
      folders: [
        { Id: 11, Name: 'Lab 6 worksheet', DueDate: '2026-10-23T03:59:00.000Z', Assessment: { ScoreDenominator: 20 }, GradeItemId: 900,
          CustomInstructions: { Text: 'Complete all parts.' }, MySubmissions: [{ Submissions: [{ Id: 5 }], Feedback: { Score: 18 } }] },
        { Id: 12, Name: 'Essay', DueDate: '2026-10-30T03:59:00.000Z', Assessment: { ScoreDenominator: 0 }, MySubmissions: [] },
        { Id: 13, Name: 'Reading log', DueDate: null, Availability: null, MySubmissions: [] },
        { Id: 14, Name: 'Bonus', DueDate: '2026-10-25T03:59:00.000Z', Assessment: { ScoreDenominator: 10 }, MySubmissions: [{ Submissions: [], Feedback: { Score: 12 } }] },
      ],
      grades: [{ GradeObjectIdentifier: '900', PointsNumerator: 18, PointsDenominator: 20 }],
    },
    {
      enrollment: { OrgUnit: { Id: 202, Name: 'Calculus I', Code: 'MATH-201' } },
      news: [], folders: [], grades: [],
    },
  ],
  dueItems: [
    { OrgUnitId: 101, ItemId: 11, ItemName: 'lab 6 worksheet', ItemUrl: '/d2l/lms/dropbox/11', DueDate: '2026-10-23T03:59:00.000Z' },
    { OrgUnitId: 202, ItemId: 77, ItemName: 'Quiz 7', ItemUrl: '/d2l/lms/quizzing/77', DueDate: '2026-10-26T03:59:00.000Z', DateCompleted: null },
    { OrgUnitId: 202, ItemId: 78, ItemName: 'Exempt quiz', DueDate: '2026-10-27T03:59:00.000Z', IsExempt: true },
    { OrgUnitId: 999, ItemId: 1, ItemName: 'Course we did not import', DueDate: '2026-10-27T03:59:00.000Z' },
  ],
  overdueItems: [],
};

test('payload passes the app import schema', () => {
  const { payload } = toImportPayload(raw);
  const result = importSchema.safeParse(payload);
  assert.ok(result.success, JSON.stringify(result.error?.issues, null, 2));
});

test('maps courses, assignments and announcements', () => {
  const { payload, warnings } = toImportPayload(raw);
  const { courses, assignments, materials } = payload.data;

  assert.equal(courses.length, 2);
  assert.equal(courses[0].code.length, 30, 'long codes are clipped to the schema limit');

  const lab = assignments.find((a: any) => a.id === 'd2l-dropbox-101-11');
  assert.deepEqual([lab.points, lab.earned, lab.status], [20, 18, 'done']);
  assert.match(lab.description, /Open in D2L: https:\/\/d2l\.example\.edu\/d2l\/lms\/dropbox\/11/);

  const essay = assignments.find((a: any) => a.id === 'd2l-dropbox-101-12');
  assert.deepEqual([essay.points, essay.status], [100, 'todo']);
  assert.match(essay.description, /placeholder/);

  assert.equal(assignments.find((a: any) => a.id === 'd2l-dropbox-101-14').earned, null, 'extra credit above max is left blank');
  assert.ok(assignments.some((a: any) => a.id === 'd2l-item-202-77'), 'quiz from due items is added');
  assert.ok(!assignments.some((a: any) => a.title === 'lab 6 worksheet'), 'due item matching a dropbox folder is not duplicated');
  assert.ok(!assignments.some((a: any) => a.title === 'Exempt quiz'));
  assert.ok(!assignments.some((a: any) => a.courseId === 'd2l-999'));

  assert.equal(materials.length, 1, 'hidden announcements are skipped');
  assert.equal(materials[0].title, 'Announcement: Office hours moved');

  assert.ok(warnings.some((w: string) => w.includes('Reading log')));
  assert.ok(warnings.some((w: string) => w.includes('Bonus')));
});

test('converts UTC due times to local calendar dates', () => {
  process.env.TZ = 'America/New_York';
  // 03:59 UTC on Oct 25 is 11:59pm Oct 24 in New York
  assert.equal(localDateKey('2026-10-25T03:59:00.000Z'), '2026-10-24');
});

