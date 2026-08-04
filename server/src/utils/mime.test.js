import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extOf, canPreview, isPdf, fileCategory } from '../utils/mime.js';

describe('mime utils', () => {
  it('parses extension', () => {
    assert.equal(extOf('Report.DOCX'), 'docx');
  });

  it('detects previewable', () => {
    assert.equal(canPreview('a.pdf'), true);
    assert.equal(canPreview('a.png'), true);
    assert.equal(canPreview('a.docx'), false);
  });

  it('detects pdf', () => {
    assert.equal(isPdf('x.PDF'), true);
  });

  it('categories', () => {
    assert.equal(fileCategory('a.xlsx'), 'office');
    assert.equal(fileCategory('a.djvu'), 'djvu');
    assert.equal(fileCategory('a.txt'), 'text');
  });
});
