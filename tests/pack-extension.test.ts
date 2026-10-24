import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { siteOrigin, withSite } from '../scripts/pack-extension.mjs';

const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));

test('site address comes from CLASSSYNC_SITE_URL, then Vercel, and must be https', () => {
  assert.equal(siteOrigin({ CLASSSYNC_SITE_URL: 'https://classsync.example.com/some/page' }), 'https://classsync.example.com');
  assert.equal(siteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'classsync.vercel.app' }), 'https://classsync.vercel.app');
  assert.equal(siteOrigin({}), null);
  assert.throws(() => siteOrigin({ CLASSSYNC_SITE_URL: 'http://classsync.example.com' }));
});

test('the live site is added to the bridge script and host permissions once', () => {
  const packed = withSite(manifest, 'https://classsync.example.com');
  assert.equal(packed.content_scripts[0].matches[0], 'https://classsync.example.com/*');
  assert.ok(packed.host_permissions.includes('https://classsync.example.com/*'));
  assert.ok(packed.content_scripts[0].matches.includes('http://127.0.0.1:3000/*'), 'keeps localhost');
  assert.deepEqual(withSite(packed, 'https://classsync.example.com'), packed, 'idempotent');
  assert.equal(withSite(manifest, null), manifest);
  assert.ok(!manifest.content_scripts[0].matches.includes('https://classsync.example.com/*'), 'original untouched');
});
