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

  const SYLLABUS_TYPES = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', text: 'text/plain' };
  const MAX_SYLLABUS_BYTES = 8 * 1024 * 1024;
  const MIN_SYLLABUS_TEXT = 300;

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  const textToBase64 = text => toBase64(new TextEncoder().encode(text));

  // D2L Content pages and the Course Overview are HTML; keep line structure, drop markup
  function htmlToText(html) {
    return String(html)
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|table|ul|ol|section|article)>/gi, '\n')
      .replace(/<(td|th)[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
      .replace(/[ \t]+/g, ' ').replace(/ *\n[ \n]*/g, '\n').trim();
  }

  const fileNameOf = url => { try { return decodeURIComponent(String(url ?? '').split('?')[0].split('/').pop() ?? ''); } catch { return ''; } };
  const kindOf = url => {
    const ext = (fileNameOf(url).match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
    return ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ['html', 'htm'].includes(ext) ? 'html' : ext === 'txt' ? 'txt' : null;
  };

  // Higher is more likely to be the syllabus; 0 means not a candidate
  function scoreTopic(topic) {
    const title = topic.Title ?? '', file = fileNameOf(topic.Url), modules = topic.moduleTitles.join(' / ');
    let score = 0;
    if (/syllab/i.test(title)) score += 10;
    if (/syllab/i.test(file)) score += 9;
    if (/syllab/i.test(modules)) score += 6;
    if (/course (outline|information|info|overview|guide|policies)|getting started|start here|welcome/i.test(title)) score += 4;
    else if (/course (outline|information|info|overview|guide)|getting started|start here/i.test(modules)) score += 2;
    if (/schedule|calendar|course plan|due dates/i.test(title + ' ' + file)) score += 3;
    if (score && /quiz|exam key|answer|solution|lecture|slides|chapter|worksheet|rubric/i.test(title)) score -= 4;
    return score;
  }

  // Looks for the syllabus everywhere a student can reach: Content files and pages (scored by
  // title, file name and folder), the Course Overview attachment, and the Overview text.
  // Returns the best readable match plus a short report of what was checked.
  async function findSyllabus(le, ou, toc, overview) {
    const topics = topicsOf(toc?.Modules).filter(t => t.TopicId != null);
    const candidates = topics
      .map(t => ({ topic: t, kind: kindOf(t.Url), score: scoreTopic(t) }))
      .filter(c => c.kind && c.score > 0)
      .map(c => ({ ...c, score: c.score + (c.kind === 'pdf' ? 1 : c.kind === 'docx' ? 0.5 : 0) }));
    if (overview?.HasAttachment) candidates.push({ overviewAttachment: true, kind: null, score: 8, title: 'Course Overview attachment' });
    const overviewText = htmlToText(overview?.Description?.Html || overview?.Description?.Text || '');
    if (overviewText.length >= MIN_SYLLABUS_TEXT && /syllab|grading|grade breakdown|office hours|exam|course schedule/i.test(overviewText)) {
      candidates.push({ overviewText, kind: 'html', score: /syllab/i.test(overviewText) ? 7 : 5, title: 'Course Overview' });
    }
    candidates.sort((a, b) => b.score - a.score);
    const report = {
      checked: topics.length + (overview ? 1 : 0),
      candidates: candidates.slice(0, 8).map(c => ({ title: String(c.topic?.Title ?? c.title).slice(0, 120), where: c.topic ? (c.topic.moduleTitles.filter(Boolean).join(' / ') || 'Content') : 'Course Overview', kind: c.kind ?? 'file', score: c.score })),
      chosen: null,
    };

    for (const candidate of candidates.slice(0, 4)) {
      try {
        if (candidate.overviewText) {
          report.chosen = 'Course Overview';
          return { syllabus: { topicId: 'overview', title: 'Course Overview', fileName: 'course-overview.txt', mimeType: SYLLABUS_TYPES.text, base64: textToBase64(candidate.overviewText.slice(0, 200000)) }, report };
        }
        const url = candidate.overviewAttachment ? `${origin}/d2l/api/le/${le}/${ou}/overview/attachment` : `${origin}/d2l/api/le/${le}/${ou}/content/topics/${candidate.topic.TopicId}/file`;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) continue;
        const buffer = await res.arrayBuffer();
        if (!buffer.byteLength || buffer.byteLength > MAX_SYLLABUS_BYTES) continue;
        const bytes = new Uint8Array(buffer.slice(0, 8));
        const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
        const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
        const disposition = res.headers.get('content-disposition') ?? '';
        const name = (fileNameOf(candidate.topic?.Url) || disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1] || 'syllabus').slice(0, 200);
        const title = String(candidate.topic?.Title ?? candidate.title).slice(0, 200);
        let syllabus = null;
        if (isPdf) syllabus = { mimeType: SYLLABUS_TYPES.pdf, base64: toBase64(buffer), fileName: /\.pdf$/i.test(name) ? name : `${name}.pdf` };
        else if (isZip && (candidate.kind === 'docx' || /\.docx$/i.test(name))) syllabus = { mimeType: SYLLABUS_TYPES.docx, base64: toBase64(buffer), fileName: name };
        else if (candidate.kind === 'html' || candidate.kind === 'txt' || /text\/(html|plain)/i.test(res.headers.get('content-type') ?? '')) {
          const raw = new TextDecoder().decode(buffer);
          const text = candidate.kind === 'txt' ? raw.trim() : htmlToText(raw);
          if (text.length >= MIN_SYLLABUS_TEXT) syllabus = { mimeType: SYLLABUS_TYPES.text, base64: textToBase64(text.slice(0, 200000)), fileName: `${name.replace(/\.(html?|txt)$/i, '') || 'syllabus'}.txt` };
        }
        if (!syllabus) continue;
        report.chosen = title;
        return { syllabus: { topicId: candidate.topic?.TopicId ?? 'overview-attachment', title, ...syllabus }, report };
      } catch { /* try the next candidate */ }
    }
    return { syllabus: null, report };
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
      const [news, folders, grades, categories, toc, overview] = await Promise.all([
        get(`/d2l/api/le/${le}/${ou}/news/`, { optional: true }),
        get(`/d2l/api/le/${le}/${ou}/dropbox/folders/`, { optional: true }),
        get(`/d2l/api/le/${le}/${ou}/grades/values/myGradeValues/`, { optional: true }),
        get(`/d2l/api/le/${le}/${ou}/grades/categories/`, { optional: true }),
        get(`/d2l/api/le/${le}/${ou}/content/toc`, { optional: true }),
        get(`/d2l/api/le/${le}/${ou}/overview`, { optional: true }),
      ]);
      const { syllabus, report: syllabusSearch } = await findSyllabus(le, ou, toc, overview).catch(() => ({ syllabus: null, report: { checked: 0, candidates: [], chosen: null } }));
      // one request per assignment; four at a time stays well under D2L's rate limit
      const foldersWithSubmissions = await mapLimit(folders ?? [], 4, async folder => {
        const submissions = await get(`/d2l/api/le/${le}/${ou}/dropbox/folders/${folder.Id}/submissions/mysubmissions/`, { optional: true });
        return { ...folder, MySubmissions: submissions ?? [] };
      });
      courses.push({ enrollment, news: news ?? [], folders: foldersWithSubmissions, grades: grades ?? [], categories: categories ?? [], syllabus, syllabusSearch });
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
