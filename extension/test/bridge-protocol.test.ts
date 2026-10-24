import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/bridge-protocol.js';

const { parsePageMessage, PAGE_TYPES } = (globalThis as any).ClassSyncBridgeProtocol;
const win = { location: { origin: 'http://127.0.0.1:3000' } };
const event = (data: unknown, overrides: Record<string, unknown> = {}) => ({ source: win, origin: win.location.origin, data, ...overrides });

test('accepts allowed page messages from this window and origin only', () => {
  for (const type of PAGE_TYPES.filter((t: string) => t !== 'connect')) {
    assert.deepEqual(parsePageMessage(event({ source: 'classsync-app', type }), win), { type });
  }
  assert.equal(parsePageMessage(event({ source: 'classsync-app', type: 'ping' }, { source: {} }), win), null, 'other window');
  assert.equal(parsePageMessage(event({ source: 'classsync-app', type: 'ping' }, { origin: 'https://evil.example' }), win), null, 'other origin');
  assert.equal(parsePageMessage(event({ source: 'someone-else', type: 'ping' }), win), null);
  assert.equal(parsePageMessage(event({ source: 'classsync-app', type: 'collect-everything' }), win), null);
  assert.equal(parsePageMessage(event('ping'), win), null);
});

test('connect requires a bare https D2L origin', () => {
  assert.deepEqual(parsePageMessage(event({ source: 'classsync-app', type: 'connect', d2lOrigin: 'https://ung.view.usg.edu', schoolName: 'UNG' }), win),
    { type: 'connect', d2lOrigin: 'https://ung.view.usg.edu', schoolName: 'UNG' });
  assert.equal(parsePageMessage(event({ source: 'classsync-app', type: 'connect', d2lOrigin: 'http://ung.view.usg.edu' }), win), null);
  assert.equal(parsePageMessage(event({ source: 'classsync-app', type: 'connect', d2lOrigin: 'https://ung.view.usg.edu/d2l/home' }), win), null);
  assert.equal(parsePageMessage(event({ source: 'classsync-app', type: 'connect', d2lOrigin: 'javascript:alert(1)' }), win), null);
  const unnamed = parsePageMessage(event({ source: 'classsync-app', type: 'connect', d2lOrigin: 'https://d2l.example.edu' }), win);
  assert.equal(unnamed.schoolName, 'd2l.example.edu');
});
