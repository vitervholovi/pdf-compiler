import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PDFDocument, rgb } from 'pdf-lib';
import { sliceCalcPdfToA4Landscape, A4_LANDSCAPE } from './sliceCalcPdf.js';

test('sliceCalcPdfToA4Landscape fits width and paginates tall sheets', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slice-'));
  const pdfPath = path.join(dir, 'wide.pdf');

  const src = await PDFDocument.create();
  // Wider than A4 landscape, taller than one page when scaled to width
  const W = 1600;
  const H = 2000;
  const page = src.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.9, 0.9, 0.95) });
  page.drawText('TOP', { x: 40, y: H - 60, size: 36, color: rgb(0, 0, 0) });
  page.drawText('BOTTOM', { x: 40, y: 40, size: 36, color: rgb(0, 0, 0) });
  await fs.writeFile(pdfPath, await src.save());

  const { pagesIn, pagesOut } = await sliceCalcPdfToA4Landscape(pdfPath);
  assert.equal(pagesIn, 1);
  assert.ok(pagesOut >= 2, `expected ≥2 slices, got ${pagesOut}`);

  const out = await PDFDocument.load(await fs.readFile(pdfPath));
  assert.equal(out.getPageCount(), pagesOut);
  for (const p of out.getPages()) {
    const { width, height } = p.getSize();
    assert.ok(Math.abs(width - A4_LANDSCAPE.width) < 0.1);
    assert.ok(Math.abs(height - A4_LANDSCAPE.height) < 0.1);
  }

  await fs.rm(dir, { recursive: true, force: true });
});
