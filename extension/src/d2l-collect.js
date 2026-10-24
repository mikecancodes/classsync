// Reads the signed-in student's data from the D2L (Valence) REST API. GET requests only.
//
// This function runs in two places: inside an open D2L tab (injected with
// chrome.scripting.executeScript, which serializes it) or in the background worker.
// So it must be self-contained: no imports, no references to anything outside its body.
// It never throws; it returns { ok: true, data } or { ok: false, code, error }.
export async function collectD2L(origin) {
  class D2LError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }

  // optional: a 403/404 means "not available to students here", so return null instead of failing
  async function get(path, { optional = false } = {}) {
    const res = await fetch(origin + path, { credentials: 'include', headers: { Accept: 'application/json' } });
    const isJson = (res.headers.get('content-type') || '').includes('json');
    if (res.status === 401 || (res.ok && !isJson)) throw new D2LError('needs_login', 'Not signed in to D2L.');
    if (res.status === 429) throw new D2LError('rate_limited', 'D2L rate limit reached. Try again later.');
    if (!res.ok) {
      if (optional && (res.status === 403 || res.status === 404)) return null;
      throw new D2LError(res.status === 403 ? 'needs_login' : 'error', `D2L returned ${res.status} for ${path}`);
    }
    return res.json();
  }

  // "paged result set": { PagingInfo: { Bookmark, HasMoreItems }, Items }
  async function getPaged(path) {
    const items = [];
    let bookmark = '';
    do {
      const sep = path.includes('?') ? '&' : '?';
      const page = await get(`${path}${sep}bookmark=${encodeURIComponent(bookmark)}`);
      items.push(...page.Items);
      bookmark = page.PagingInfo?.HasMoreItems ? page.PagingInfo.Bookmark : '';
    } while (bookmark);
    return items;
  }

  // "object list page": { Objects, Next }
  async function getObjectList(path) {
    const items = [];
    let next = path;
    while (next) {
      const page = await get(next, { optional: true });
      if (!page) break;
      items.push(...(page.Objects ?? []));
      next = page.Next ? page.Next.replace(origin, '') : null;
    }
    return items;
  }

  // Runs fn over items with at most `limit` requests in flight
  async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => { while (next < items.length) { const i = next++; results[i] = await fn(items[i]); } };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  // Topics anywhere in the content tree, with the titles of the modules they sit in
  function topicsOf(modules, parents = []) {
    return (modules ?? []).flatMap(m => [
      ...(m.Topics ?? []).map(t => ({ ...t, moduleTitles: [...parents, m.Title ?? ''] })),
      ...topicsOf(m.Modules, [...parents, m.Title ?? '']),
    ]);
  }

  const SYLLABUS_TYPES = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  const MAX_SYLLABUS_BYTES = 8 * 1024 * 1024;

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  // The course's syllabus file (PDF or Word) from Content, if one is titled "syllabus"
  async function findSyllabus(le, ou, toc) {
    const extensionOf = topic => (String(topic.Url ?? '').split('?')[0].match(/\.(pdf|docx)$/i)?.[1] ?? '').toLowerCase();
    const candidates = topicsOf(toc?.Modules)
      .filter(t => t.TopicId != null && extensionOf(t) && [t.Title, ...t.moduleTitles].some(title => /syllabus/i.test(title ?? '')))
      .sort((a, b) => Number(/syllabus/i.test(b.Title ?? '')) - Number(/syllabus/i.test(a.Title ?? '')) || (extensionOf(a) === 'pdf' ? -1 : 1));
    for (const topic of candidates.slice(0, 3)) {
      const res = await fetch(`${origin}/d2l/api/le/${le}/${ou}/content/topics/${topic.TopicId}/file`, { credentials: 'include' });
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();
      if (!buffer.byteLength || buffer.byteLength > MAX_SYLLABUS_BYTES) continue;
      const ext = extensionOf(topic);
      const fileName = decodeURIComponent(String(topic.Url).split('?')[0].split('/').pop() || `syllabus.${ext}`).slice(0, 200);
      return { topicId: topic.TopicId, title: String(topic.Title || 'Syllabus').slice(0, 200), fileName, mimeType: SYLLABUS_TYPES[ext], base64: toBase64(buffer) };
    }
    return null;
  }

  try {
    const versions = await get('/d2l/api/versions/');
    const latest = code => versions.find(v => v.ProductCode === code)?.LatestVersion;
    const lp = latest('lp'), le = latest('le');
    if (!lp || !le) throw new D2LError('error', 'Could not find D2L API versions.');

    const me = await get(`/d2l/api/lp/${lp}/users/whoami`);
    // orgUnitTypeId 3 = "Course Offering" on most schools' setups
    const enrollments = await getPaged(`/d2l/api/lp/${lp}/enrollments/myenrollments/?orgUnitTypeId=3&isActive=true&canAccess=true`);

    const courses = [];
    for (const enrollment of enrollments) {
      const ou = enrollment.OrgUnit.Id;
      const [news, folders, grades, categories, toc] = await Promise.all([
        get(`/d2l/api/le/${le}/${ou}/news/`, { optional: true }),
        get(`/d2l/api/le/${le}/${ou}/dropbox/folders/`, { optional: true }),
        get(`/d2l/api/le/${le}/${ou}/grades/values/myGradeValues/`, { optional: true }),
        get(`/d2l/api/le/${le}/${ou}/grades/categories/`, { optional: true }),
        get(`/d2l/api/le/${le}/${ou}/content/toc`, { optional: true }),
      ]);
      const syllabus = toc ? await findSyllabus(le, ou, toc).catch(() => null) : null;
      // one request per assignment; four at a time stays well under D2L's rate limit
      const foldersWithSubmissions = await mapLimit(folders ?? [], 4, async folder => {
        const submissions = await get(`/d2l/api/le/${le}/${ou}/dropbox/folders/${folder.Id}/submissions/mysubmissions/`, { optional: true });
        return { ...folder, MySubmissions: submissions ?? [] };
      });
      courses.push({ enrollment, news: news ?? [], folders: foldersWithSubmissions, grades: grades ?? [], categories: categories ?? [], syllabus });
    }

    const ids = courses.map(c => c.enrollment.OrgUnit.Id).join(',');
    const dueItems = ids ? await getObjectList(`/d2l/api/le/${le}/content/myItems/due/?orgUnitIdsCSV=${ids}`) : [];
    const overdueItems = ids ? await getObjectList(`/d2l/api/le/${le}/overdueItems/myItems?orgUnitIdsCSV=${ids}`) : [];

    return {
      ok: true,
      data: {
        collectedAt: new Date().toISOString(),
        origin,
        versions: { lp, le },
        user: { id: me.Identifier, firstName: me.FirstName, lastName: me.LastName },
        courses,
        dueItems,
        overdueItems,
      },
    };
  } catch (err) {
    return { ok: false, code: err.code ?? 'error', error: err.message ?? String(err) };
  }
}
