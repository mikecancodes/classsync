import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

const MAX_BYTES = 1000000;
export function normalizeCalendarUrl(input: string) {
  const url = new URL(input.trim().replace(/^webcal:/i, 'https:'));
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Use an HTTPS calendar subscription link without a username or password.');
  }
  if (input.length > 4096) throw new Error('Calendar link is too long.');
  url.hash = '';
  return url;
}

export function isPublicAddress(address: string) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}

export async function resolveCalendarAddress(url: URL, resolver = lookup) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await resolver(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(result => !isPublicAddress(result.address))) {
    throw new Error('Calendar links must point to a public internet server.');
  }
  return { host, address: (addresses.find(result => result.family === 4) ?? addresses[0]).address };
}

// Connect to the validated IP, retaining the original TLS servername and Host.
// A second DNS resolution cannot redirect the request into a private network.
export async function fetchCalendarFeed(input: string) {
  let url = normalizeCalendarUrl(input);
  const signal = AbortSignal.timeout(12000);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const target = await Promise.race([
      resolveCalendarAddress(url),
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Calendar server timed out.')), { once: true });
        if (signal.aborted) reject(new Error('Calendar server timed out.'));
      }),
    ]);
    const response = await new Promise<{ redirect?: string; text?: string }>((resolve, reject) => {
      const request = https.request({
        hostname: target.address, port: 443, servername: isIP(target.host) ? undefined : target.host,
        path: url.pathname + url.search, method: 'GET', agent: false, signal,
        headers: { Host: url.host, Accept: 'text/calendar', 'Accept-Encoding': 'identity', 'User-Agent': 'ClassSync/1.0' },
      }, incoming => {
        const status = incoming.statusCode ?? 500;
        if ([301, 302, 303, 307, 308].includes(status) && incoming.headers.location) {
          incoming.resume(); resolve({ redirect: incoming.headers.location }); return;
        }
        if (status !== 200) { incoming.resume(); reject(new Error('Calendar server did not return a feed. Check the subscription link.')); return; }
        if (incoming.headers['content-encoding'] && incoming.headers['content-encoding'] !== 'identity') {
          incoming.destroy(); reject(new Error('Calendar server returned an unsupported encoding.')); return;
        }
        const chunks: Buffer[] = []; let size = 0;
        incoming.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) { incoming.destroy(); reject(new Error('Calendar feed exceeds the 1 MB limit.')); }
          else chunks.push(chunk);
        });
        incoming.on('error', () => reject(new Error('Calendar download failed.')));
        incoming.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8') }));
      });
      request.on('error', () => reject(new Error('Unable to reach the calendar server.')));
      request.end();
    });
    if (response.redirect) {
      url = normalizeCalendarUrl(new URL(response.redirect, url).href);
      continue;
    }
    return response.text!;
  }
  throw new Error('Calendar link redirected too many times.');
}
