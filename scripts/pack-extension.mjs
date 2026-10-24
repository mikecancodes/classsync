// Zips extension/ into public/classsync-extension.zip for the "Connect your school" page.
// Runs before every dev server start and build. The live site's address is added to the
// zipped manifest so the extension can talk to it:
//   CLASSSYNC_SITE_URL=https://classsync.example.com, else Vercel's
//   VERCEL_PROJECT_PRODUCTION_URL, else LIVE_SITE when building in CI or on Vercel.
//   Local builds without either produce a localhost-only zip for development.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'extension');
const output = join(root, 'public', 'classsync-extension.zip');
const FOLDER = 'classsync-extension';
const SKIP = new Set(['test']);
export const LIVE_SITE = 'https://classsync-two.vercel.app';

/** @param {Record<string, string | undefined>} env */
export function siteOrigin(env = process.env) {
  const raw = env.CLASSSYNC_SITE_URL?.trim()
    || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
    || (env.CI || env.VERCEL ? LIVE_SITE : '');
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error(`CLASSSYNC_SITE_URL must use https: ${raw}`);
  return url.origin;
}

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

// Points the bridge script and host access at the live site only. Localhost entries are
// dropped so another app on this computer's port 3000 can't talk to a student's extension;
// they stay in extension/manifest.json for developers loading the folder unpacked.
export function withSite(manifest, origin) {
  if (!origin) return manifest;
  const pattern = `${origin}/*`;
  const next = structuredClone(manifest);
  const live = list => [pattern, ...list.filter(item => item !== pattern && !LOCAL.test(item))];
  next.host_permissions = live(next.host_permissions ?? []);
  next.content_scripts[0].matches = live(next.content_scripts[0].matches);
  return next;
}

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** @param {Record<string, string | undefined>} env */
export function pack(env = process.env) {
  const origin = siteOrigin(env);
  const entries = {};
  for (const path of files(source)) {
    const name = `${FOLDER}/${relative(source, path).split(sep).join('/')}`;
    entries[name] = name === `${FOLDER}/manifest.json`
      ? strToU8(JSON.stringify(withSite(JSON.parse(readFileSync(path, 'utf8')), origin), null, 2))
      : readFileSync(path);
  }
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(output, zipSync(entries, { level: 9 }));
  return { origin, files: Object.keys(entries).length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { origin, files: count } = pack();
  console.log(`Packed ${count} extension files into public/classsync-extension.zip${origin ? ` for ${origin}` : ''}.`);
  if (!origin) console.warn('No CLASSSYNC_SITE_URL set: the downloaded extension will only work with localhost.');
}
