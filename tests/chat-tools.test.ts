import test from 'node:test';
import assert from 'node:assert/strict';
import { testState } from './fixtures';
import { dateKey } from '../src/lib/model';
import { shiftDate } from '../src/lib/academic-assistant';
import { MAX_ROWS, chatToolDeclarations, runTool } from '../src/lib/chat-tools';
import { MAX_TOOL_ROUNDS, chatRequestSchema, isNewQuestion, toolRoundsSinceQuestion, type ChatContent } from '../src/lib/chat-request';
import { chatInstructions, toChatReply } from '../src/lib/gemini';

const today = dateKey();
const titles = (result: Record<string, unknown>) => (result.assignments as { title: string }[]).map(a => a.title);

test('every declared tool is handled', () => {
  const state = testState();
  for (const tool of chatToolDeclarations) {
    const result = runTool(tool.name!, tool.name === 'search_notes' ? { query: 'cache' } : {}, state, today);
    assert.notEqual(result.error, 'unknown_tool', tool.name);
  }
});

test('get_assignments answers tomorrow, overdue, and done questions', () => {
  const state = testState();
  const tomorrow = shiftDate(today, 1);
  assert.deepEqual(titles(runTool('get_assignments', { from: tomorrow, to: tomorrow }, state, today)), ['Socket Programming Lab']);
  const overdue = runTool('get_assignments', { overdue_only: true }, state, today);
  assert.deepEqual(titles(overdue), ['Network Protocols Worksheet']);
  assert.equal((overdue.assignments as { overdue: boolean }[])[0].overdue, true);
  assert.equal(runTool('get_assignments', { status: 'done' }, state, today).count, 5);
});

test('date windows work across a year boundary', () => {
  const state = testState();
  state.assignments[0] = { ...state.assignments[0], due: '2027-01-01', status: 'todo' };
  const result = runTool('get_assignments', { from: '2027-01-01', to: '2027-01-01' }, state, '2026-12-31');
  assert.deepEqual(titles(result), ['Socket Programming Lab']);
});

test('course matching: exact, partial, ambiguous, unknown', () => {
  const state = testState();
  assert.equal(runTool('get_assignments', { course: 'CS 201' }, state, today).course, 'Data Structures');
  assert.equal(runTool('get_assignments', { course: 'networks' }, state, today).course, 'Computer Networks');
  const ambiguous = runTool('get_assignments', { course: 'computer' }, state, today);
  assert.equal(ambiguous.error, 'ambiguous_course');
  assert.deepEqual(ambiguous.options, ['Computer Networks (CS 310)', 'Computer Architecture (CS 250)']);
  assert.equal(runTool('get_grades', { course: 'biology' }, state, today).error, 'course_not_found');
});

test('results are capped and descriptions clipped', () => {
  const state = testState();
  const base = state.assignments[1];
  for (let i = 0; i < 40; i++) state.assignments.push({ ...base, id: `extra-${i}`, title: `Extra ${i}`, description: 'x'.repeat(2000) });
  const result = runTool('get_assignments', { status: 'all' }, state, today);
  assert.equal((result.assignments as unknown[]).length, MAX_ROWS);
  assert.equal(result.truncated, true);
  assert.ok((result.assignments as { description: string }[]).every(a => a.description.length <= 300));
});

test('bad input and unknown tools return errors instead of throwing', () => {
  const state = testState();
  assert.match(String(runTool('get_assignments', { from: 'tomorrow' }, state, today).error), /date/);
  assert.match(String(runTool('get_assignments', { status: 'later' }, state, today).error), /status/);
  assert.equal(runTool('delete_everything', {}, state, today).error, 'unknown_tool');
  assert.match(String(runTool('search_notes', {}, state, today).error), /query/);
  assert.doesNotThrow(() => runTool('get_announcements', 'not an object', state, today));
});

test('grades, announcements, notes, and study order use workspace data', () => {
  const state = testState();
  const grades = runTool('get_grades', { course: 'data structures' }, state, today).courses as { currentGrade: number; letter: string }[];
  assert.deepEqual([grades[0].currentGrade, grades[0].letter], [94, 'A']);

  const announcements = runTool('get_announcements', { limit: 2 }, state, today).announcements as { title: string }[];
  assert.deepEqual(announcements.map(a => a.title), ['Lab resources are ready', 'A little help with priority queues']);

  const notes = runTool('search_notes', { query: 'binary heaps' }, state, today).results as { course: string; kind: string }[];
  assert.equal(notes[0].course, 'Data Structures');
  const fromAnnouncement = runTool('search_notes', { query: 'socket examples' }, state, today).results as { kind: string }[];
  assert.ok(fromAnnouncement.some(r => r.kind === 'announcement'));

  const plan = runTool('suggest_study_order', { days: 3 }, state, today);
  assert.deepEqual((plan.overdue as { title: string }[]).map(a => a.title), ['Network Protocols Worksheet']);
  assert.ok((plan.days as { date: string }[]).every(d => d.date >= today && d.date <= shiftDate(today, 3)));
});

const question: ChatContent = { role: 'user', parts: [{ text: 'What is due tomorrow?' }] };
const call: ChatContent = { role: 'model', parts: [{ functionCall: { id: '1', name: 'get_assignments', args: {} }, thoughtSignature: 'sig' }] };
const results: ChatContent = { role: 'user', parts: [{ functionResponse: { id: '1', name: 'get_assignments', response: { count: 0 } } }] };
const request = (contents: ChatContent[]) => ({ contents, today: '2026-10-24', timeZone: 'America/New_York' });

test('chat request schema enforces roles, size, and the lookup limit', () => {
  assert.ok(chatRequestSchema.safeParse(request([question, call, results])).success);
  assert.ok(!chatRequestSchema.safeParse(request([{ role: 'system', parts: [{ text: 'hi' }] } as never])).success);
  assert.ok(!chatRequestSchema.safeParse(request([question, call])).success, 'last turn must be the user');
  assert.ok(!chatRequestSchema.safeParse(request(Array(41).fill(question))).success);
  assert.ok(!chatRequestSchema.safeParse({ ...request([question]), timeZone: 'Mars/Olympus' }).success);
  const tooMany = [question, ...Array(MAX_TOOL_ROUNDS + 1).fill([call, results]).flat()];
  assert.ok(!chatRequestSchema.safeParse(request(tooMany)).success);
  assert.equal(toolRoundsSinceQuestion([question, call, results, call, results]), 2);
  assert.equal(isNewQuestion([question]), true);
  assert.equal(isNewQuestion([question, call, results]), false);
});

test('Gemini replies map to tool calls or text, keeping thought signatures', () => {
  const tools = toChatReply({ functionCalls: [{ id: '1', name: 'get_assignments', args: { overdue_only: true } }], candidates: [{ content: call }] });
  assert.equal(tools.type, 'tools');
  assert.deepEqual(tools.type === 'tools' && tools.calls, [{ id: '1', name: 'get_assignments', args: { overdue_only: true } }]);
  assert.equal(tools.content.parts?.[0].thoughtSignature, 'sig');

  const text = toChatReply({ text: '  You are all caught up!  ', candidates: [{ content: { role: 'model', parts: [{ text: 'You are all caught up!' }] } }] });
  assert.deepEqual(text.type === 'text' && text.text, 'You are all caught up!');
  assert.throws(() => toChatReply({ text: '', candidates: [] }));
});

test('chat instructions include the date and the no-emoji, data-only rules', () => {
  const instructions = chatInstructions('2026-10-24', 'America/New_York');
  assert.match(instructions, /2026-10-24/);
  assert.match(instructions, /no emoji/i);
  assert.match(instructions, /only from tool results/i);
});
