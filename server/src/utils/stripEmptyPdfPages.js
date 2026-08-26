/**
 * Strip blank / near-empty pages from a PDF (LibreOffice Calc often emits extras).
 */
import fs from 'fs/promises';
import { PDFDocument, PDFName, PDFArray, PDFStream, PDFRawStream } from 'pdf-lib';
import { normalizePdf } from './normalizePdf.js';

function streamByteLength(obj) {
  if (!obj) return 0;
  if (typeof obj.getContents === 'function') {
    try {
      return obj.getContents()?.length || 0;
    } catch {
      return 0;
    }
  }
  if (obj instanceof PDFRawStream || obj instanceof PDFStream) {
    try {
      return obj.contents?.length || 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

/** Sum content-stream bytes for a page (0 ≈ blank). */
export function pageContentByteLength(page) {
  try {
    const node = page.node;
    const contents = node.get(PDFName.of('Contents'));
    if (!contents) return 0;
    const ctx = page.doc.context;
    let total = 0;
    const visit = (refOrObj) => {
      if (!refOrObj) return;
      const obj = ctx.lookup(refOrObj) ?? refOrObj;
      if (obj instanceof PDFArray) {
        for (const item of obj.asArray()) visit(item);
        return;
      }
      total += streamByteLength(obj);
    };
    visit(contents);
    return total;
  } catch {
    return 1;
  }
}

/**
 * Heuristic: LO empty pages usually have tiny content streams (page setup only).
 * Keep pages with meaningful drawing operators.
 */
export function isLikelyEmptyPdfPage(page, minBytes = 48) {
  return pageContentByteLength(page) < minBytes;
}

/**
 * Rewrite pdfPath in place without empty pages. Keeps at least one page if all empty.
 * @returns {Promise<{ removed: number, kept: number }>}
 */
export async function stripEmptyPdfPages(pdfPath) {
  await normalizePdf(pdfPath);
  const bytes = await fs.readFile(pdfPath);
  const src = await PDFDocument.load(bytes);
  const total = src.getPageCount();
  if (total <= 1) return { removed: 0, kept: total };

  const keep = [];
  for (let i = 0; i < total; i++) {
    if (!isLikelyEmptyPdfPage(src.getPage(i))) keep.push(i);
  }
  if (!keep.length) keep.push(0);
  if (keep.length === total) return { removed: 0, kept: total };

  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, keep);
  for (const p of copied) out.addPage(p);
  await fs.writeFile(pdfPath, await out.save());
  return { removed: total - keep.length, kept: keep.length };
}
