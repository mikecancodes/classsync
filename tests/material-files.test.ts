import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMaterialFile } from '../src/lib/material-files';

test('allows PDF, Word, and image file signatures', async () => {
  const examples: [string, number[]][] = [
    ['notes.pdf', [37,80,68,70,45]], ['notes.docx', [80,75,3,4]],
    ['notes.doc', [208,207,17,224,161,177,26,225]],
    ['notes.png', [137,80,78,71,13,10,26,10]], ['notes.jpg', [255,216,255]],
    ['notes.gif', [71,73,70,56]], ['notes.webp', [82,73,70,70,0,0,0,0,87,69,66,80]],
  ];
  for (const [name, bytes] of examples) await validateMaterialFile(new File([new Uint8Array(bytes)], name));
});

test('rejects unsupported extensions and renamed files', async () => {
  for (const name of ['notes.txt', 'notes.csv', 'notes.exe', 'notes.svg', 'notes.pdf']) {
    await assert.rejects(validateMaterialFile(new File(['plain text'], name)), /Choose a valid/);
  }
});

test('rejects oversized files', async () => {
  const content = new Uint8Array(10 * 1024 * 1024 + 1);
  content.set([37,80,68,70,45]);
  await assert.rejects(validateMaterialFile(new File([content], 'notes.pdf')), /10 MB/);
});
