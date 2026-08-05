import test from 'node:test';
import assert from 'node:assert/strict';
import { patchPageLayoutProperties } from './odsPageLayout.js';

test('patchPageLayoutProperties forces A4 landscape fit-width', () => {
  const out = patchPageLayoutProperties(
    ' fo:page-width="8in" fo:page-height="11in" style:print-orientation="portrait" style:scale-to="100" fo:margin-top="0.5in"'
  );
  assert.match(out, /fo:page-width="29\.7cm"/);
  assert.match(out, /fo:page-height="21cm"/);
  assert.match(out, /style:print-orientation="landscape"/);
  assert.match(out, /style:scale-to-X="1"/);
  assert.doesNotMatch(out, /style:scale-to-Y=/);
  assert.match(out, /fo:margin-top="0\.5in"/);
  assert.doesNotMatch(out, /style:scale-to="/);
});
