import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSignedInD2LPage } from '../src/d2l-pages.js';
import { collectD2L } from '../src/d2l-collect.js';

const UNG = 'https://ung.view.usg.edu';
const page = (path: string, origin = UNG) => isSignedInD2LPage(new URL(path, origin), UNG);

test('any signed-in D2L page starts the sync', () => {
  for (const path of ['/d2l/home', '/d2l/home/123456', '/d2l/le/content/123/Home', '/d2l/lp/homepage/home.d2l?ou=6606']) assert.equal(page(path), true, path);
});

test('login, logout, SSO hand-off and other sites do not', () => {
  for (const path of ['/d2l/login', '/d2l/login?target=%2fd2l%2fhome', '/d2l/logout', '/d2l/lp/auth/login/login.d2l', '/d2l/lp/auth/saml/initiate-login', '/', '/index.asp']) assert.equal(page(path), false, path);
  assert.equal(page('/d2l/home', 'https://login.microsoftonline.com'), false);
});

test('submissions are fetched with at most four requests in flight', async () => {
  let inFlight = 0, peak = 0;
  const folders = Array.from({ length: 10 }, (_, i) => ({ Id: i + 1, Name: `Lab ${i + 1}` }));
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  (globalThis as any).fetch = async (url: string) => {
    const path = url.replace('https://d2l.test', '');
    if (path === '/d2l/api/versions/') return json([{ ProductCode: 'lp', LatestVersion: '1.49' }, { ProductCode: 'le', LatestVersion: '1.82' }]);
    if (path.endsWith('/users/whoami')) return json({ Identifier: '1' });
    if (path.includes('myenrollments')) return json({ PagingInfo: { HasMoreItems: false }, Items: [{ OrgUnit: { Id: 7, Name: 'Bio' } }] });
    if (path.endsWith('/dropbox/folders/')) return json(folders);
    if (path.includes('/mysubmissions/')) {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 15));
      inFlight--;
      return json([]);
    }
    if (path.includes('myItems') || path.includes('overdueItems')) return json({ Objects: [] });
    return json([]);
  };
  const result: any = await collectD2L('https://d2l.test');
  assert.equal(result.ok, true);
  assert.equal(result.data.courses[0].folders.length, 10);
  assert.deepEqual(result.data.courses[0].folders.map((f: any) => f.Id), folders.map(f => f.Id), 'order kept');
  assert.ok(peak > 1 && peak <= 4, `peak ${peak}`);
});
