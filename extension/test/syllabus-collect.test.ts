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
