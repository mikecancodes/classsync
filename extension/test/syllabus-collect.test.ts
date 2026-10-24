import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectD2L } from '../src/d2l-collect.js';

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

test('finds the syllabus file in Content and downloads it as base64; grade categories ride along', async () => {
  const requested: string[] = [];
  (globalThis as any).fetch = async (url: string) => {
    const path = url.replace('https://d2l.test', '');
    requested.push(path);
    if (path === '/d2l/api/versions/') return json([{ ProductCode: 'lp', LatestVersion: '1.64' }, { ProductCode: 'le', LatestVersion: '1.100' }]);
    if (path.endsWith('/users/whoami')) return json({ Identifier: '1' });
    if (path.includes('myenrollments')) return json({ PagingInfo: { HasMoreItems: false }, Items: [{ OrgUnit: { Id: 7, Name: 'Bio' } }] });
    if (path.endsWith('/grades/categories/')) return json([{ Id: 1, Name: 'Exams', Weight: 60, Grades: [{ Id: 9 }] }]);
    if (path.endsWith('/content/toc')) return json({ Modules: [
      { Title: 'Start Here', Topics: [{ TopicId: 40, Title: 'Welcome video', Url: '/content/enforced/7/welcome.mp4' }], Modules: [
        { Title: 'Course Syllabus', Topics: [
          { TopicId: 41, Title: 'Syllabus (Word)', Url: '/content/enforced/7/BIOL1107%20Syllabus.docx' },
          { TopicId: 42, Title: 'Syllabus', Url: '/content/enforced/7/BIOL1107%20Syllabus.pdf?ou=7' },
        ] },
      ] },
    ] });
    if (path.endsWith('/content/topics/42/file')) return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), { headers: { 'content-type': 'application/pdf' } });
    if (path.includes('myItems') || path.includes('overdueItems')) return json({ Objects: [] });
    return json([]);
  };
  const result: any = await collectD2L('https://d2l.test');
  assert.equal(result.ok, true, result.error);
  const course = result.data.courses[0];
  assert.deepEqual(course.categories, [{ Id: 1, Name: 'Exams', Weight: 60, Grades: [{ Id: 9 }] }]);
  assert.deepEqual(course.syllabus, { topicId: 42, title: 'Syllabus', fileName: 'BIOL1107 Syllabus.pdf', mimeType: 'application/pdf', base64: 'JVBERi0=' });
  assert.ok(!requested.some(p => p.endsWith('/topics/40/file')), 'non-syllabus files are never downloaded');
});

test('no syllabus and no gradebook access still syncs', async () => {
  (globalThis as any).fetch = async (url: string) => {
    const path = url.replace('https://d2l.test', '');
    if (path === '/d2l/api/versions/') return json([{ ProductCode: 'lp', LatestVersion: '1.64' }, { ProductCode: 'le', LatestVersion: '1.100' }]);
    if (path.endsWith('/users/whoami')) return json({ Identifier: '1' });
    if (path.includes('myenrollments')) return json({ PagingInfo: { HasMoreItems: false }, Items: [{ OrgUnit: { Id: 7, Name: 'Bio' } }] });
    if (path.endsWith('/grades/categories/') || path.endsWith('/content/toc')) return new Response('', { status: 403 });
    if (path.includes('myItems') || path.includes('overdueItems')) return json({ Objects: [] });
    return json([]);
  };
  const result: any = await collectD2L('https://d2l.test');
  assert.equal(result.ok, true);
  assert.deepEqual([result.data.courses[0].categories, result.data.courses[0].syllabus], [[], null]);
});

// A mock D2L where only the given content/overview responses exist
function mockD2L(routes: Record<string, () => Response>) {
  (globalThis as any).fetch = async (url: string) => {
    const path = url.replace('https://d2l.test', '');
    if (path === '/d2l/api/versions/') return json([{ ProductCode: 'lp', LatestVersion: '1.64' }, { ProductCode: 'le', LatestVersion: '1.100' }]);
    if (path.endsWith('/users/whoami')) return json({ Identifier: '1' });
    if (path.includes('myenrollments')) return json({ PagingInfo: { HasMoreItems: false }, Items: [{ OrgUnit: { Id: 7, Name: 'Bio' } }] });
    for (const [suffix, respond] of Object.entries(routes)) if (path.endsWith(suffix)) return respond();
    if (path.endsWith('/overview') || path.endsWith('/content/toc')) return new Response('', { status: 404 });
    if (path.includes('myItems') || path.includes('overdueItems')) return json({ Objects: [] });
    return json([]);
  };
}
const pdfBytes = () => new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), { headers: { 'content-type': 'application/pdf' } });
const longText = 'Grading: Exams 60%, Labs 40%. Office hours Tuesday. ' + 'Exam 1 is on Oct 30. '.repeat(20);
const decode = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));

test('finds a syllabus by its file name even when the title says something else', async () => {
  mockD2L({
    '/content/toc': () => json({ Modules: [{ Title: 'Week 1', Topics: [
      { TopicId: 5, Title: 'Lecture 1 slides', Url: '/content/7/lecture1.pdf' },
      { TopicId: 6, Title: 'Course Information', Url: '/content/7/BIOL1107_Syllabus_Fall26.pdf' },
    ] }] }),
    '/content/topics/6/file': pdfBytes,
  });
  const result: any = await collectD2L('https://d2l.test');
  assert.equal(result.data.courses[0].syllabus.title, 'Course Information');
  assert.equal(result.data.courses[0].syllabus.fileName, 'BIOL1107_Syllabus_Fall26.pdf');
  assert.equal(result.data.courses[0].syllabusSearch.chosen, 'Course Information');
});

test('reads a syllabus written as a D2L Content page (HTML) as text', async () => {
  mockD2L({
    '/content/toc': () => json({ Modules: [{ Title: 'Start Here', Topics: [{ TopicId: 9, Title: 'Syllabus', Url: '/content/7/syllabus.html' }] }] }),
    '/content/topics/9/file': () => new Response(`<html><body><h1>BIOL 1107 Syllabus</h1><p>${longText}</p><script>evil()</script></body></html>`, { headers: { 'content-type': 'text/html' } }),
  });
  const result: any = await collectD2L('https://d2l.test');
  const syllabus = result.data.courses[0].syllabus;
  assert.equal(syllabus.mimeType, 'text/plain');
  assert.equal(syllabus.fileName, 'syllabus.txt');
  const text = decode(syllabus.base64);
  assert.match(text, /BIOL 1107 Syllabus\nGrading: Exams 60%/);
  assert.ok(!/evil|<p>/.test(text), 'markup and scripts removed');
});

test('falls back to the Course Overview attachment, then the Overview text', async () => {
  mockD2L({
    '/overview': () => json({ Description: { Text: '', Html: '' }, HasAttachment: true }),
    '/overview/attachment': pdfBytes,
  });
  let result: any = await collectD2L('https://d2l.test');
  assert.equal(result.data.courses[0].syllabus.mimeType, 'application/pdf');
  assert.equal(result.data.courses[0].syllabusSearch.chosen, 'Course Overview attachment');

  mockD2L({ '/overview': () => json({ Description: { Html: `<p>Welcome! ${longText}</p>` }, HasAttachment: false }) });
  result = await collectD2L('https://d2l.test');
  assert.equal(result.data.courses[0].syllabus.title, 'Course Overview');
  assert.match(decode(result.data.courses[0].syllabus.base64), /Office hours Tuesday/);
});

test('when nothing works, the report lists what was checked', async () => {
  mockD2L({
    '/content/toc': () => json({ Modules: [{ Title: 'Course Info', Topics: [{ TopicId: 3, Title: 'Course Outline', Url: '/content/7/outline.pdf' }, { TopicId: 4, Title: 'Video', Url: '/content/7/intro.mp4' }] }] }),
    '/content/topics/3/file': () => new Response('', { status: 403 }),
  });
  const result: any = await collectD2L('https://d2l.test');
  const course = result.data.courses[0];
  assert.equal(course.syllabus, null);
  assert.equal(course.syllabusSearch.checked, 2);
  assert.equal(course.syllabusSearch.chosen, null);
  assert.deepEqual(course.syllabusSearch.candidates.map((c: any) => [c.title, c.where]), [['Course Outline', 'Course Info']]);
});
