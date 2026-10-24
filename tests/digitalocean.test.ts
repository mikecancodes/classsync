import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfigured, generateChat, extractSyllabus } from '../src/lib/ai';
import type { ChatMessage } from '../src/lib/chat-request';

// Ethan's DigitalOcean scenarios, against the single provider module (src/lib/ai.ts)
test('DigitalOcean tool round trip uses the inference endpoint and fails closed', async () => {
  const oldFetch = globalThis.fetch;
  const oldEnv = { key: process.env.DIGITALOCEAN_MODEL_ACCESS_KEY, model: process.env.DIGITALOCEAN_MODEL };
  process.env.DIGITALOCEAN_MODEL_ACCESS_KEY = 'synthetic-test-key';
  process.env.DIGITALOCEAN_MODEL = 'synthetic-model';
  try {
    assert.equal(aiConfigured(), true);
    let mode = 'tools';
    const seen: { url: string; auth: string | null; body: any }[] = [];
    globalThis.fetch = async (url, options) => {
      seen.push({ url: String(url), auth: new Headers(options?.headers).get('Authorization'), body: JSON.parse(String(options?.body)) });
      if (mode === 'quota') return new Response('quota exhausted', { status: 429 });
      return Response.json({ choices: [{ finish_reason: 'stop', message: mode === 'tools'
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'lookup1', type: 'function', function: { name: 'get_assignments', arguments: '{}' } }] }
        : mode === 'bad' ? { role: 'assistant', content: null, tool_calls: [{ id: 'lookup1', type: 'function', function: { name: 'delete_course', arguments: '{}' } }] }
        : { role: 'assistant', content: 'No assignments are due.' } }] });
    };
    const question: ChatMessage[] = [{ role: 'user', content: 'What is due?' }];
    const first = await generateChat(question, '2026-10-24', 'America/New_York');
    assert.equal(first.type, 'tools');
    const request = seen[0];
    assert.equal(request.url, 'https://inference.do-ai.run/v1/chat/completions');
    assert.equal(request.auth, 'Bearer synthetic-test-key');
    assert.equal(request.body.model, 'synthetic-model');
    assert.equal(request.body.max_completion_tokens, 2048);
    assert.equal(request.body.messages[0].role, 'system', 'server adds the instructions');
    assert.ok(request.body.tools.some((tool: { function: { name: string } }) => tool.function.name === 'get_assignments'));

    mode = 'text';
    const followUp: ChatMessage[] = [...question, first.message, { role: 'tool', tool_call_id: 'lookup1', content: '{"assignments":[]}' }];
    assert.equal((await generateChat(followUp, '2026-10-24', 'America/New_York')).type, 'text');
    assert.deepEqual(seen[1].body.messages.slice(-2).map((m: { role: string }) => m.role), ['assistant', 'tool'], 'call and result are forwarded in order');

    mode = 'bad';
    await assert.rejects(() => generateChat(question, '2026-10-24', 'America/New_York'), /Unknown model tool/);
    mode = 'quota';
    await assert.rejects(() => generateChat(question, '2026-10-24', 'America/New_York'), /AI provider returned 429/);

    delete process.env.DIGITALOCEAN_MODEL;
    mode = 'text';
    await generateChat(question, '2026-10-24', 'America/New_York');
    assert.equal(seen.at(-1)!.body.model, 'glm-5.3-flash', 'default model when DIGITALOCEAN_MODEL is unset');
    delete process.env.DIGITALOCEAN_MODEL_ACCESS_KEY;
    assert.equal(aiConfigured(), false);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [name, value] of Object.entries({ DIGITALOCEAN_MODEL_ACCESS_KEY: oldEnv.key, DIGITALOCEAN_MODEL: oldEnv.model })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('syllabus extraction asks for JSON and validates what comes back', async () => {
  const oldFetch = globalThis.fetch;
  process.env.DIGITALOCEAN_MODEL_ACCESS_KEY = 'synthetic-test-key';
  try {
    let body: any;
    globalThis.fetch = async (_url, options) => {
      body = JSON.parse(String(options?.body));
      return Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Sure!\n{"items":[{"title":"Exam 2","date":"2026-11-03","type":"exam"},{"title":"Bad","date":"soon","type":"exam"}],"weights":[{"name":"Exams","weight":60},{"name":"Labs","weight":40},{"name":"exams","weight":10}]}' } }] });
    };
    const result = await extractSyllabus({ course: { name: 'Biology', code: 'BIOL 1107' }, today: '2026-10-24', text: 'Exam 2 on Nov 3' });
    assert.deepEqual(result.items, [{ title: 'Exam 2', date: '2026-11-03', type: 'exam' }]);
    assert.deepEqual(result.weights, [{ name: 'Exams', weight: 60 }, { name: 'Labs', weight: 40 }], 'duplicate category names dropped');
    assert.match(body.messages[0].content, /grading breakdown/i);
    assert.equal(body.response_format.type, 'json_schema');
    assert.match(body.messages[0].content, /untrusted/i);
  } finally {
    globalThis.fetch = oldFetch;
    delete process.env.DIGITALOCEAN_MODEL_ACCESS_KEY;
  }
});
