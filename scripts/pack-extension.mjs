// Zips extension/ into public/classsync-extension.zip for the "Connect your school" page.
// Runs before every dev server start and build. The live site's address is added to the
// zipped manifest so the extension can talk to it:
//   CLASSSYNC_SITE_URL=https://classsync.example.com   (set in Vercel), or Vercel's
//   VERCEL_PROJECT_PRODUCTION_URL. Without either, the zip only works with localhost.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'extension');
const output = join(root, 'public', 'classsync-extension.zip');
const FOLDER = 'classsync-extension';
const SKIP = new Set(['test']);

/** @param {Record<string, string | undefined>} env */
export function siteOrigin(env = process.env) {
  const raw = env.CLASSSYNC_SITE_URL?.trim() || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error(`CLASSSYNC_SITE_URL must use https: ${raw}`);
  return url.origin;
}

// Adds the live site to where the bridge script runs and what the extension may message
export function withSite(manifest, origin) {
  if (!origin) return manifest;
  const pattern = `${origin}/*`;
  const next = structuredClone(manifest);
  const add = list => (list.includes(pattern) ? list : [pattern, ...list]);
  next.host_permissions = add(next.host_permissions ?? []);
  next.content_scripts[0].matches = add(next.content_scripts[0].matches);
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
