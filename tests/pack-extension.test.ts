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

test('a live-site zip talks only to the live site', () => {
  const packed = withSite(manifest, 'https://classsync.example.com');
  assert.deepEqual(packed.content_scripts[0].matches, ['https://classsync.example.com/*']);
  assert.deepEqual(packed.host_permissions, ['https://classsync.example.com/*']);
  assert.deepEqual(packed.optional_host_permissions, ['https://*/*'], 'D2L access still asked per school');
  assert.deepEqual(withSite(packed, 'https://classsync.example.com'), packed, 'idempotent');
  assert.equal(withSite(manifest, null), manifest);
  assert.ok(!manifest.content_scripts[0].matches.includes('https://classsync.example.com/*'), 'original untouched');
});
