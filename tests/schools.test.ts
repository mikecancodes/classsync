import test from 'node:test';
import assert from 'node:assert/strict';
import { customSchool, findSchools, normalizeD2LUrl, schoolForOrigin } from '../src/lib/schools';

test('normalizeD2LUrl turns any D2L link into its https address', () => {
  assert.deepEqual(normalizeD2LUrl('ung.view.usg.edu'), { origin: 'https://ung.view.usg.edu' });
  assert.deepEqual(normalizeD2LUrl('  https://UNG.view.usg.edu/d2l/home/123456?ou=1  '), { origin: 'https://ung.view.usg.edu' });
  assert.deepEqual(normalizeD2LUrl('https://d2l.example.edu:8443/d2l/login'), { origin: 'https://d2l.example.edu:8443' });
});

test('normalizeD2LUrl rejects insecure, local and junk input', () => {
  for (const input of ['', 'http://ung.view.usg.edu', 'ftp://ung.view.usg.edu', 'localhost:3000', 'https://192.168.1.10', 'https://[::1]', 'not a url at all', 'javascript:alert(1)']) {
    assert.ok('error' in normalizeD2LUrl(input), input);
  }
});

test('findSchools finds UNG by short name, full name and address', () => {
  for (const query of ['ung', 'UNG', 'north georgia', 'georgiaview', 'view.usg']) {
    assert.equal(findSchools(query)[0]?.id, 'ung', query);
  }
  assert.deepEqual(findSchools('no such school'), []);
  assert.equal(findSchools('').length > 0, true);
});

test('known and custom schools resolve from an address', () => {
  assert.equal(schoolForOrigin('https://ung.view.usg.edu')?.shortName, 'UNG');
  assert.equal(schoolForOrigin('https://d2l.example.edu'), undefined);
  assert.deepEqual(customSchool('https://d2l.example.edu'), { id: 'custom:d2l.example.edu', name: 'd2l.example.edu', shortName: 'd2l.example.edu', d2lOrigin: 'https://d2l.example.edu' });
});
