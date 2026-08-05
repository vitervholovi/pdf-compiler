import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  colToIndex,
  indexToCol,
  parseRangeRef,
  parsePrintAreas,
  densifyRange,
  trimSheetXml,
  detectUsedRange,
  prepareCalcXlsx,
  applySheetPrintLayout,
  suggestPrintOrientation,
  upsertPrintAreas,
  pickSheetRange,
  unionRanges
} from './calcWorkbook.js';
import { readZip, writeZip } from './zipStore.js';

test('col index roundtrip', () => {
  assert.equal(colToIndex('A'), 1);
  assert.equal(colToIndex('I'), 9);
  assert.equal(colToIndex('XFD'), 16384);
  assert.equal(indexToCol(9), 'I');
  assert.equal(indexToCol(16384), 'XFD');
});

test('parseRangeRef handles sheet-qualified dollars', () => {
  const r = parseRangeRef('БЧС!$A$1:$I$162');
  assert.deepEqual(r, { minCol: 1, minRow: 1, maxCol: 9, maxRow: 162 });
});

test('parsePrintAreas reads localSheetId', () => {
  const xml = `<definedNames>
    <definedName name="_xlnm.Print_Area" localSheetId="0">БЧС!$A$1:$I$162</definedName>
  </definedNames>`;
  const map = parsePrintAreas(xml);
  assert.deepEqual(map.get(0), { minCol: 1, minRow: 1, maxCol: 9, maxRow: 162 });
});

test('densifyRange cuts after large column gap', () => {
  const pts = [
    { col: 1, row: 1 },
    { col: 2, row: 1 },
    { col: 9, row: 5 },
    { col: 16000, row: 10 }
  ];
  const r = densifyRange(pts, { minCol: 1, minRow: 1, maxCol: 16000, maxRow: 10 });
  assert.equal(r.maxCol, 9);
});

test('trimSheetXml drops far cells and merges; rewrites dimension', () => {
  const xml = `<?xml version="1.0"?>
<worksheet>
  <dimension ref="A1:XFD225"/>
  <cols><col min="1" max="9" width="10"/><col min="100" max="200" width="3"/></cols>
  <sheetData>
    <c r="A1" t="s"><v>0</v></c>
    <c r="I2"><v>1</v></c>
    <c r="XFD10"><v>9</v></c>
  </sheetData>
  <mergeCells count="2">
    <mergeCell ref="A1:B1"/>
    <mergeCell ref="XDA113:XFD113"/>
  </mergeCells>
</worksheet>`;
  const out = trimSheetXml(xml, { minCol: 1, minRow: 1, maxCol: 9, maxRow: 162 });
  assert.match(out, /dimension ref="A1:I162"/);
  assert.match(out, /r="A1"/);
  assert.match(out, /r="I2"/);
  assert.doesNotMatch(out, /r="XFD10"/);
  assert.match(out, /mergeCell ref="A1:B1"/);
  assert.doesNotMatch(out, /XDA113/);
  assert.doesNotMatch(out, /min="100"/);
});

test('trimSheetXml does not keep far cells after self-closing neighbours', () => {
  const xml = `<worksheet>
  <sheetData>
    <row r="34" spans="1:16384">
      <c r="I34" s="274"/><c r="DA34" s="320" t="s"><v>594</v></c><c r="DB34" s="321"/>
    </row>
  </sheetData>
</worksheet>`;
  const out = trimSheetXml(xml, { minCol: 1, minRow: 1, maxCol: 9, maxRow: 223 });
  assert.match(out, /r="I34"/);
  assert.doesNotMatch(out, /DA34|DB34/);
  assert.match(out, /spans="1:9"/);
});

test('detectUsedRange prefers valued cells and densifies', () => {
  const xml = `<sheetData>
    <c r="A1"><v>1</v></c>
    <c r="H20"><v>2</v></c>
    <c r="XEW100" s="1"/>
    <c r="XFD225" s="1"/>
  </sheetData>`;
  const r = detectUsedRange(xml);
  assert.ok(r.maxCol <= 8);
  assert.equal(r.maxRow, 20);
});

test('zipStore roundtrip', () => {
  const entries = new Map([
    ['xl/workbook.xml', Buffer.from('<workbook/>', 'utf8')],
    ['xl/worksheets/sheet1.xml', Buffer.from('<worksheet/>', 'utf8')]
  ]);
  const buf = writeZip(entries);
  const back = readZip(buf);
  assert.equal(back.get('xl/workbook.xml').toString(), '<workbook/>');
  assert.equal(back.get('xl/worksheets/sheet1.xml').toString(), '<worksheet/>');
});

test('applySheetPrintLayout fits width on landscape A4, paginates height', () => {
  const xml = `<?xml version="1.0"?>
<worksheet>
  <dimension ref="A1:I162"/>
  <cols><col min="1" max="9" width="8"/></cols>
  <sheetData>
    <c r="A1"><v>1</v></c>
  </sheetData>
  <pageSetup orientation="portrait" scale="100"/>
  <colBreaks count="1" manualBreakCount="1"><brk id="5" max="1048575" man="1"/></colBreaks>
  <rowBreaks count="1" manualBreakCount="1"><brk id="40" max="16383" man="1"/></rowBreaks>
</worksheet>`;
  const range = { minCol: 1, minRow: 1, maxCol: 9, maxRow: 162 };
  const out = applySheetPrintLayout(xml, range, { orientation: 'landscape' });
  assert.match(out, /pageSetUpPr fitToPage="1"/);
  assert.match(out, /pageSetup[^>]*orientation="landscape"/);
  assert.match(out, /fitToWidth="1"/);
  assert.match(out, /fitToHeight="0"/);
  assert.doesNotMatch(out, /scale="100"/);
  assert.doesNotMatch(out, /colBreaks/);
  assert.doesNotMatch(out, /rowBreaks/);
  assert.match(out, /pageMargins /);
});

test('suggestPrintOrientation always landscape for Excel', () => {
  assert.equal(
    suggestPrintOrientation({ minCol: 1, minRow: 1, maxCol: 5, maxRow: 100 }),
    'landscape'
  );
});

test('pickSheetRange unions rows but caps width to sane Print_Area', () => {
  const used = { minCol: 1, minRow: 1, maxCol: 9, maxRow: 200 };
  const print = { minCol: 1, minRow: 1, maxCol: 9, maxRow: 162 };
  assert.deepEqual(pickSheetRange(print, used), {
    minCol: 1,
    minRow: 1,
    maxCol: 9,
    maxRow: 200
  });
  const usedWide = { minCol: 1, minRow: 1, maxCol: 16000, maxRow: 223 };
  assert.deepEqual(pickSheetRange(print, usedWide), {
    minCol: 1,
    minRow: 1,
    maxCol: 9,
    maxRow: 223
  });
  const crazy = { minCol: 1, minRow: 1, maxCol: 16384, maxRow: 100 };
  assert.deepEqual(pickSheetRange(crazy, used), used);
  assert.deepEqual(unionRanges(print, used).maxRow, 200);
});

test('upsertPrintAreas rewrites Print_Area names', () => {
  const wb = `<?xml version="1.0"?>
<workbook>
  <definedNames>
    <definedName name="_xlnm.Print_Area" localSheetId="0">Old!$A$1:$Z$999</definedName>
  </definedNames>
</workbook>`;
  const out = upsertPrintAreas(wb, [
    { localIndex: 0, name: 'БЧС', range: { minCol: 1, minRow: 1, maxCol: 9, maxRow: 162 } }
  ]);
  assert.match(out, /localSheetId="0"/);
  assert.match(out, /Print_Area[^>]*>'?БЧС'?!A1:I162</);
  assert.doesNotMatch(out, /Old!/);
});

test('prepareCalcXlsx trims sample workbook Print_Area', async () => {
  const sample =
    '/mnt/c/Users/UserOne/Downloads/55604_БЧС по ВШДР_04.08.2026_v3 (1).xlsx';
  try {
    await fs.access(sample);
  } catch {
    return; // skip if sample missing
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'calc-trim-'));
  const out = path.join(dir, 'trimmed.xlsx');
  const result = await prepareCalcXlsx(sample, out);
  assert.equal(result.trimmed, true);
  assert.equal(result.sheets, 1);

  const entries = readZip(await fs.readFile(out));
  const sheet = entries.get('xl/worksheets/sheet1.xml').toString('utf8');
  assert.match(sheet, /dimension ref="A1:I\d+"/);
  assert.doesNotMatch(sheet, /r="XFD/);
  assert.doesNotMatch(sheet, /r="XEW/);
  assert.doesNotMatch(sheet, /dimension ref="A1:XEX/);
  assert.match(sheet, /pageSetUpPr fitToPage="1"/);
  assert.match(sheet, /fitToWidth="1"/);
  assert.match(sheet, /fitToHeight="0"/);
  assert.match(sheet, /orientation="landscape"/);
  assert.doesNotMatch(sheet, /colBreaks/);
  const wb = entries.get('xl/workbook.xml').toString('utf8');
  assert.doesNotMatch(wb, /state="hidden"/);
  assert.match(wb, /_xlnm\.Print_Area/);
  await fs.rm(dir, { recursive: true, force: true });
});
