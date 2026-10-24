import test from 'node:test';
import assert from 'node:assert/strict';
import { oceanMessages, generateOceanChat } from '../src/lib/digitalocean';
import { chatConfigured } from '../src/lib/chat-provider';

test('tool results retain call IDs and exclude model reasoning', () => {
  assert.deepEqual(oceanMessages([
    { role: 'user', parts: [{ text: 'What is due?' }] },
    { role: 'model', parts: [{ thought: true, text: 'private reasoning' }, { functionCall: { id: 'lookup1', name: 'get_assignments', args: { status: 'incomplete' } } }] },
    { role: 'user', parts: [{ functionResponse: { id: 'lookup1', name: 'get_assignments', response: { assignments: [] } } }] },
  ]), [
    { role: 'user', content: 'What is due?' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'lookup1', type: 'function', function: { name: 'get_assignments', arguments: '{"status":"incomplete"}' } }] },
    { role: 'tool', tool_call_id: 'lookup1', content: '{"assignments":[]}' },
  ]);
});

test('DigitalOcean tool round trip uses the inference endpoint and fails closed', async () => {
  const oldFetch = globalThis.fetch;
  const oldEnv = { key: process.env.DIGITALOCEAN_MODEL_ACCESS_KEY, model: process.env.DIGITALOCEAN_MODEL, provider: process.env.AI_CHAT_PROVIDER };
  process.env.DIGITALOCEAN_MODEL_ACCESS_KEY = 'synthetic-test-key';
  process.env.DIGITALOCEAN_MODEL = 'synthetic-model';
  process.env.AI_CHAT_PROVIDER = 'digitalocean';
  try {
    assert.equal(chatConfigured(), true);
    let mode = 'tools';
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://inference.do-ai.run/v1/chat/completions');
      const body = JSON.parse(String(options?.body));
      assert.equal(body.model, 'synthetic-model');
      assert.equal(body.max_completion_tokens, 2048);
      assert.ok(body.tools.some((tool: { function: { name: string } }) => tool.function.name === 'get_assignments'));
      if (mode === 'quota') return new Response('quota exhausted', { status: 429 });
      return Response.json({ choices: [{ finish_reason: 'stop', message: mode === 'tools'
        ? { tool_calls: [{ id: 'lookup1', type: 'function', function: { name: 'get_assignments', arguments: '{}' } }] }
        : mode === 'bad' ? { tool_calls: [{ id: 'lookup1', type: 'function', function: { name: 'delete_course', arguments: '{}' } }] }
        : { content: 'No assignments are due.' } }] });
    };
    const contents = [{ role: 'user' as const, parts: [{ text: 'What is due?' }] }];
    const first = await generateOceanChat(contents, '2026-10-24', 'America/New_York');
    assert.equal(first.type, 'tools');
    mode = 'text';
    assert.equal((await generateOceanChat([...contents, first.content, { role: 'user', parts: [{ functionResponse: { id: 'lookup1', name: 'get_assignments', response: { assignments: [] } } }] }], '2026-10-24', 'America/New_York')).type, 'text');
    mode = 'bad';
    await assert.rejects(() => generateOceanChat(contents, '2026-10-24', 'America/New_York'), /Unknown model tool/);
    mode = 'quota';
    await assert.rejects(() => generateOceanChat(contents, '2026-10-24', 'America/New_York'), /inference failed/);
    delete process.env.DIGITALOCEAN_MODEL_ACCESS_KEY;
    assert.equal(chatConfigured(), false);
    await assert.rejects(() => generateOceanChat(contents, '2026-10-24', 'America/New_York'), /not configured/);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [name, value] of Object.entries({ DIGITALOCEAN_MODEL_ACCESS_KEY: oldEnv.key, DIGITALOCEAN_MODEL: oldEnv.model, AI_CHAT_PROVIDER: oldEnv.provider })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
