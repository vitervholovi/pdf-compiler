import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeUploadFilename, safeFilename } from './filenames.js';

test('decodes multer latin1 mojibake to Cyrillic', () => {
  // Simulate what multer stores: UTF-8 bytes of "Шаблон.pdf" read as latin1
  const utf8 = 'Шаблон.pdf';
  const mojibake = Buffer.from(utf8, 'utf8').toString('latin1');
  assert.notEqual(mojibake, utf8);
  assert.equal(decodeUploadFilename(mojibake), utf8);
});

test('safeFilename keeps Cyrillic after decode', () => {
  const mojibake = Buffer.from('Бланк Шаблон (5).pdf', 'utf8').toString('latin1');
  assert.equal(safeFilename(mojibake), 'Бланк Шаблон (5).pdf');
});

test('ascii names stay unchanged', () => {
  assert.equal(decodeUploadFilename('report.pdf'), 'report.pdf');
  assert.equal(safeFilename('report.pdf'), 'report.pdf');
});
