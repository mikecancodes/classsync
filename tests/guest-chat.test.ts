import test from 'node:test';
import assert from 'node:assert/strict';
import { guestChatIdentity } from '../src/lib/guest-chat';
import { allowRequest } from '../src/lib/server';

test('guest chat accepts its own site and rejects cross-site requests', () => {
  const url = 'https://classsync-two.vercel.app/api/ai/chat';
  assert.ok(guestChatIdentity(new Request(url, { headers: { origin: 'https://classsync-two.vercel.app' } })));
  assert.equal(guestChatIdentity(new Request(url, { headers: { origin: 'https://other.example' } })), null);
  assert.equal(guestChatIdentity(new Request(url, { headers: { 'sec-fetch-site': 'cross-site' } })), null);
});

test('guest quotas use a hashed proxy address and share the unknown-address bucket', () => {
  const url = 'https://classsync-two.vercel.app/api/ai/chat';
  const identity = guestChatIdentity(new Request(url, { headers: { 'x-vercel-forwarded-for': '192.0.2.1' } }));
  assert.ok(identity && !identity.includes('192.0.2.1'));
  assert.notEqual(identity, guestChatIdentity(new Request(url, { headers: { 'x-vercel-forwarded-for': '192.0.2.2' } })));
  assert.equal(guestChatIdentity(new Request(url)), guestChatIdentity(new Request(url)));
  assert.equal(allowRequest('test:guest-limit', 1), true);
  assert.equal(allowRequest('test:guest-limit', 1), false);
});

test('signed-out chat reaches the server provider and never returns its key', async () => {
  const { POST } = await import('../src/app/api/ai/chat/route');
  const previousKey = process.env.DIGITALOCEAN_MODEL_ACCESS_KEY;
  const previousFetch = globalThis.fetch;
  process.env.DIGITALOCEAN_MODEL_ACCESS_KEY = 'test-only-inference-key';
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-only-inference-key');
    return Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Try a short practice session.' } }] });
  };
  try {
    const request = (origin: string) => new Request('https://classsync-two.vercel.app/api/ai/chat', {
      method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'How can I study?' }], today: '2026-10-24', timeZone: 'America/New_York' }),
    });
    assert.equal((await POST(request('https://other.example'))).status, 403);
    assert.equal(calls, 0);
    const response = await POST(request('https://classsync-two.vercel.app'));
    assert.equal(response.status, 200);
    const result = await response.text();
    assert.match(result, /Try a short practice session/);
    assert.ok(!result.includes('test-only-inference-key'));
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.DIGITALOCEAN_MODEL_ACCESS_KEY;
    else process.env.DIGITALOCEAN_MODEL_ACCESS_KEY = previousKey;
  }
});
