import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudConflictError, CloudWorkspaceSession, readCloudWorkspace, writeCloudWorkspace } from '../src/lib/cloud-workspace';
import { testState } from './fixtures';
import { createWorkspaceHandlers } from '../src/lib/workspace-api';
import type { authenticate } from '../src/lib/server';

test('cloud baselines never cross accounts and reset after sign out', () => {
  const session = new CloudWorkspaceSession();
  assert.equal(session.revisionFor('a'), 0);
  session.accept('a', 7);
  assert.equal(session.revisionFor('a'), 7);
  assert.equal(session.revisionFor('b'), 0);
  session.reset();
  assert.equal(session.revisionFor('a'), 0);
});

test('writes require the expected revision and do not retry conflicts', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.expectedRevision, 4);
    assert.deepEqual(body.data, demo);
    return Response.json({ error: 'conflict' }, { status: 409 });
  };
  const demo = testState();
  await assert.rejects(writeCloudWorkspace('token', demo, 4, fetcher), CloudConflictError);
  assert.equal(calls, 1);
  await assert.rejects(writeCloudWorkspace('token', demo, -1, fetcher));
  assert.equal(calls, 1);
});

test('cloud reads reject missing revisions rather than silently treating existing data as new', async () => {
  const fetcher: typeof fetch = async () => Response.json({ data: testState() });
  await assert.rejects(readCloudWorkspace('token', fetcher));
});

type AuthResult = NonNullable<Awaited<ReturnType<typeof authenticate>>>;
function handlers(error: { code: string } | null = null) {
  const calls: unknown[] = [];
  const auth = async () => ({
    user: { id: 'verified-owner' },
    db: { rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { error, data: error ? null : [{ revision: 2, updated_at: '2026-10-24T18:00:00Z' }] };
    } },
  } as unknown as AuthResult);
  return { ...createWorkspaceHandlers(auth), calls };
}
const put = (body: unknown) => new Request('http://localhost/api/workspace', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('workspace routes reject unauthenticated requests', async () => {
  const api = createWorkspaceHandlers(async () => null);
  assert.equal((await api.GET(new Request('http://localhost/api/workspace'))).status, 401);
  assert.equal((await api.PUT(put({}))).status, 401);
});

test('legacy, missing-revision, forged-owner and invalid-workspace saves never reach the database', async () => {
  const api = handlers();
  const data = testState();
  for (const body of [data, { data }, { data, expectedRevision: null }, { data, expectedRevision: 1, user_id: 'other' }, { data: {}, expectedRevision: 1 }]) {
    assert.equal((await api.PUT(put(body))).status, 400);
  }
  assert.equal(api.calls.length, 0);
});

test('valid route save forwards only validated data and expected revision to the atomic RPC', async () => {
  const api = handlers();
  const data = testState();
  const response = await api.PUT(put({ data, expectedRevision: 1 }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { revision: 2, updatedAt: '2026-10-24T18:00:00Z' });
  assert.deepEqual(api.calls, [{ name: 'save_workspace', args: { workspace_data: data, expected_revision: 1 } }]);
});

test('route exposes conflicts as 409 and database failures as 503 without leaking errors', async () => {
  const body = { data: testState(), expectedRevision: 1 };
  assert.equal((await handlers({ code: 'PT409' }).PUT(put(body))).status, 409);
  assert.equal((await handlers({ code: 'PGRST202' }).PUT(put(body))).status, 503);
});
