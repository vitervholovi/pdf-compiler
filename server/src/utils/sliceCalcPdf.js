/**
 * After LibreOffice SinglePageSheets, each sheet is one (possibly huge) PDF page.
 * Scale to A4 landscape width and slice vertically so columns stay together.
 */
import fs from 'fs/promises';
import { PDFDocument } from 'pdf-lib';

/** A4 landscape in PDF points */
export const A4_LANDSCAPE = { width: 841.89, height: 595.28 };

/**
 * @param {string} pdfPath
 * @returns {Promise<{ pagesIn: number, pagesOut: number }>}
 */
export async function sliceCalcPdfToA4Landscape(pdfPath) {
  const bytes = await fs.readFile(pdfPath);
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const { width: A4W, height: A4H } = A4_LANDSCAPE;
  const pagesIn = src.getPageCount();
  let pagesOut = 0;

  for (let pi = 0; pi < pagesIn; pi++) {
    const srcPage = src.getPage(pi);
    const { width: W, height: H } = srcPage.getSize();
    if (!(W > 0 && H > 0)) continue;

    const scale = A4W / W;
    const scaledH = H * scale;
    const slices = Math.max(1, Math.ceil(scaledH / A4H - 1e-9));
    const embedded = await out.embedPage(srcPage);

    for (let i = 0; i < slices; i++) {
      const page = out.addPage([A4W, A4H]);
      // Align top of sheet to top of first slice; shift up for later slices
      const y = A4H - scaledH + i * A4H;
      page.drawPage(embedded, {
        x: 0,
        y,
        xScale: scale,
        yScale: scale
      });
      pagesOut += 1;
    }
  }

  if (!pagesOut) {
    out.addPage([A4W, A4H]);
    pagesOut = 1;
  }

  await fs.writeFile(pdfPath, await out.save());
  return { pagesIn, pagesOut };
}
