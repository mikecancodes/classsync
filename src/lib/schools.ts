// Schools with a known D2L (Brightspace) address. Students at other schools paste any
// page from their D2L instead; normalizeD2LUrl turns that into the site address.

export type School = { id: string; name: string; shortName: string; d2lOrigin: string; system?: string };

export const schools: School[] = [
  // Verified 2026-10-24: /d2l/api/versions/ answers with lp 1.64 and le 1.100
  { id: 'ung', name: 'University of North Georgia', shortName: 'UNG', d2lOrigin: 'https://ung.view.usg.edu', system: 'GeorgiaVIEW (USG)' },
];

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();

export function findSchools(query: string, list = schools) {
  const q = normalize(query);
  if (!q) return list;
  return list.filter(school => [school.name, school.shortName, school.system ?? '', new URL(school.d2lOrigin).hostname].some(field => normalize(field).includes(q)));
}

export type NormalizedD2L = { origin: string } | { error: string };

// Accepts "ung.view.usg.edu", "https://ung.view.usg.edu/d2l/home/12345" and similar
export function normalizeD2LUrl(input: string): NormalizedD2L {
  const text = input.trim();
  if (!text) return { error: 'Paste a link to any page of your school’s D2L.' };
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`); }
  catch { return { error: 'That doesn’t look like a web address.' }; }
  if (url.protocol === 'http:') return { error: 'Use the secure https:// address of your D2L.' };
  if (url.protocol !== 'https:') return { error: 'That doesn’t look like a web address.' };
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || /^\d+(\.\d+){3}$/.test(host) || host.startsWith('[')) return { error: 'Use your school’s D2L web address, like ung.view.usg.edu.' };
  return { origin: url.origin };
}

export const schoolForOrigin = (origin: string) => schools.find(school => school.d2lOrigin === origin);

export function customSchool(origin: string): School {
  const host = new URL(origin).hostname;
  return { id: `custom:${host}`, name: host, shortName: host, d2lOrigin: origin };
}
