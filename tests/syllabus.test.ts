import test from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { findSyllabusDates } from '../src/lib/syllabus-rules';
import { addProposals, proposeAssignments } from '../src/lib/syllabus-items';
import { docxToText, base64ToBytes } from '../src/lib/document-text';
import { parseSyllabusItems, syllabusRequestSchema } from '../src/lib/syllabus';
import { syllabusInstructions } from '../src/lib/gemini';
import { emptyWorkspace } from '../src/lib/workspace';
import { AcademicState, stateSchema } from '../src/lib/model';

const syllabusText = `BIOL 1107 Principles of Biology — Fall 2026
Office hours: Tuesdays 2-4pm
Week 3  Lab 2: Microscopy due Sept 12
Quiz 1 (Chapters 1-3) - Friday, September 18 (20 pts)
Midterm Exam: Oct 14
Research paper draft due 11/06
Final Exam — December 9, 2026
Thanksgiving break Nov 25-27`;

test('rule-based scanner finds dated deliverables and infers the year', () => {
  const items = findSyllabusDates(syllabusText, '2026-08-20');
  assert.deepEqual(items.map(i => [i.date, i.type]), [
    ['2026-09-12', 'lab'], ['2026-09-18', 'quiz'], ['2026-10-14', 'exam'], ['2026-11-06', 'project'], ['2026-12-09', 'exam'],
  ]);
  assert.equal(items.find(i => i.type === 'quiz')?.points, 20);
  assert.ok(items.every(i => !/sept|september|oct|friday/i.test(i.title)), items.map(i => i.title).join(' | '));
  assert.ok(!items.some(i => /office|thanksgiving/i.test(i.title)), 'non-deliverables skipped');
});

test('a date in January near a fall today rolls into next year', () => {
  assert.equal(findSyllabusDates('Final project due Jan 8', '2026-12-01')[0]?.date, '2027-01-08');
});

const course = { id: 'bio', code: 'BIOL 1107', name: 'Biology', professor: '', schedule: '', color: 'blue' as const, categories: [{ name: 'Exams', weight: 50 }, { name: 'Labs', weight: 50 }], syllabus: '' };
const state = (): AcademicState => stateSchema.parse({ ...emptyWorkspace(), courses: [course], assignments: [{ id: 'd2l-item-1', courseId: 'bio', title: 'Midterm Exam', due: '2026-10-15', status: 'todo', category: 'Exams', points: 100, earned: null, description: '' }] });

test('proposals map to matching categories and flag items already in ClassSync', () => {
  const items = findSyllabusDates(syllabusText, '2026-08-20');
  const proposals = proposeAssignments(items, course, state());
  const midterm = proposals.find(p => /midterm/i.test(p.assignment.title))!;
  assert.equal(midterm.duplicateOf, 'Midterm Exam', 'one day apart, same words');
  assert.equal(proposals.find(p => p.assignment.title.startsWith('Lab 2'))!.assignment.category, 'Labs');
  assert.equal(proposals.find(p => /paper/i.test(p.assignment.title))!.assignment.category, 'From syllabus');
  assert.ok(proposals.every(p => p.assignment.id.length <= 100));
});

test('adding proposals creates the weight-0 category once and stays valid', () => {
  const items = findSyllabusDates(syllabusText, '2026-08-20');
  const chosen = proposeAssignments(items, course, state()).filter(p => !p.duplicateOf).map(p => p.assignment);
  const next = addProposals(state(), chosen);
  assert.ok(stateSchema.safeParse(next).success);
  assert.deepEqual(next.courses[0].categories.map(c => [c.name, c.weight]), [['Exams', 50], ['Labs', 50], ['From syllabus', 0]]);
  assert.equal(addProposals(next, chosen).assignments.length, next.assignments.length, 'adding twice changes nothing');
});

test('Word documents become line-separated text', () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>Quiz 1 &amp; review</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Exam 2</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Nov 3</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
  const docx = zipSync({ 'word/document.xml': strToU8(xml), '[Content_Types].xml': strToU8('<Types/>') });
  const text = docxToText(docx);
  assert.match(text, /Quiz 1 & review/);
  assert.match(text, /Exam 2\s*\n+\s*Nov 3/);
  assert.throws(() => docxToText(new Uint8Array([1, 2, 3])), /couldn’t be read/);
  // 40 MB of text compresses to a few KB: must be refused without inflating it all
  const bomb = zipSync({ 'word/document.xml': new Uint8Array(40 * 1024 * 1024).fill(97) }, { level: 9 });
  assert.ok(bomb.length < 200_000, `bomb is ${bomb.length} bytes`);
  const started = Date.now();
  assert.throws(() => docxToText(bomb), /too large/);
  assert.ok(Date.now() - started < 2000, 'stops early');
  // Same bomb, but its headers claim the text is only 1 KB
  const lying = bomb.slice();
  const view = new DataView(lying.buffer);
  for (let i = 0; i < lying.length - 4; i++) {
    const signature = view.getUint32(i, true);
    if (signature === 0x04034b50) view.setUint32(i + 22, 1024, true); // local header: uncompressed size
    if (signature === 0x02014b50) view.setUint32(i + 24, 1024, true); // central directory: uncompressed size
  }
  assert.throws(() => docxToText(lying), /too large/, 'counts real output, not declared size');
  assert.deepEqual([...base64ToBytes(btoa('abc'))], [97, 98, 99]);
});

test('AI results are validated item by item', () => {
  const items = parseSyllabusItems({ items: [
    { title: 'Exam 2', date: '2026-11-03', type: 'exam' },
    { title: 'Exam 2', date: '2026-11-03', type: 'exam' },
    { title: 'Bad date', date: 'Nov 3', type: 'exam' },
    { title: '', date: '2026-11-04', type: 'quiz' },
    { title: 'Lab 4', date: '2026-10-01', type: 'lab', points: 25 },
    { title: 'Weird type', date: '2026-10-02', type: 'party' },
  ] });
  assert.deepEqual(items.map(i => i.title), ['Lab 4', 'Exam 2']);
  assert.deepEqual(parseSyllabusItems('nonsense'), []);
});

test('syllabus requests need exactly one of a PDF or text', () => {
  const base = { course: { name: 'Biology', code: 'BIOL 1107' }, today: '2026-10-24' };
  assert.ok(syllabusRequestSchema.safeParse({ ...base, text: 'Exam Nov 3' }).success);
  assert.ok(syllabusRequestSchema.safeParse({ ...base, file: { mimeType: 'application/pdf', data: 'JVBERi0=' } }).success);
  assert.ok(!syllabusRequestSchema.safeParse(base).success);
  assert.ok(!syllabusRequestSchema.safeParse({ ...base, text: 'x', file: { mimeType: 'application/pdf', data: 'JVBERi0=' } }).success);
  assert.ok(!syllabusRequestSchema.safeParse({ ...base, file: { mimeType: 'image/png', data: 'x' } }).success);
  assert.match(syllabusInstructions(base.course, base.today), /untrusted/i);
});
