import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import sharp from 'sharp';
import { PDFDocument, rgb } from 'pdf-lib';
import { extOf, fileCategory, IMAGE_EXT, DJVU_EXT, TEXT_EXT, OFFICE_EXT } from '../utils/mime.js';
import { resolveDocumentFont } from '../utils/fonts.js';
import { maybePrepareCalcFile } from '../utils/calcWorkbook.js';
import { stripEmptyPdfPages } from '../utils/stripEmptyPdfPages.js';
import { patchOdsPageLayoutForFitWidth } from '../utils/odsPageLayout.js';
import { normalizePdf } from '../utils/normalizePdf.js';

/** Serialize LibreOffice — concurrent soffice without unique profiles fails silently. */
let libreOfficeChain = Promise.resolve();

function enqueueLibreOffice(task) {
  const next = libreOfficeChain.then(task, task);
  libreOfficeChain = next.catch(() => {});
  return next;
}

const CALC_EXT = new Set(['xls', 'xlsx', 'ods', 'csv']);

/** Normal Calc PDF (page style / scale-to-X comes from patched ODS). */
const CALC_PDF_FILTER = 'pdf:calc_pdf_Export';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = opts.timeoutMs
      ? setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`${cmd} timed out after ${opts.timeoutMs}ms`));
      }, opts.timeoutMs)
      : null;
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} failed (${code}): ${(stderr || stdout || '').slice(0, 500)}`));
    });
  });
}

async function findProducedPdf(outDir, preferredName) {
  const preferred = path.join(outDir, preferredName);
  try {
    await fs.access(preferred);
    return preferred;
  } catch {
    const files = await fs.readdir(outDir).catch(() => []);
    const pdfs = files.filter((f) => f.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 1) return path.join(outDir, pdfs[0]);
    throw new Error(
      `LibreOffice не створив PDF (файли в каталозі: ${files.join(', ') || 'немає'})`
    );
  }
}

/**
 * Calc → trim(xlsx) → ODS → patch scale-to-X=1 landscape A4 → PDF.
 * Avoids SinglePageSheets (huge page → tiny content when scaled).
 */
async function convertCalcToPdf(inputPath, outDir, { quick = false } = {}) {
  await fs.mkdir(outDir, { recursive: true });
  const ext = path.extname(inputPath).toLowerCase() || '.xlsx';
  const extKey = ext.replace(/^\./, '');

  let sourcePath = path.join(outDir, `source${ext}`);
  if (extKey === 'xlsx') {
    await maybePrepareCalcFile(inputPath, sourcePath);
  } else {
    await fs.copyFile(inputPath, sourcePath);
  }

  const profileDir = path.join(
    outDir,
    `lo-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  await fs.mkdir(profileDir, { recursive: true });
  const profileUri = pathToFileURL(profileDir).href;
  const timeoutMs = quick ? 120000 : 300000;

  try {
    let odsPath = sourcePath;
    if (extKey !== 'ods') {
      await run(
        'soffice',
        [
          `-env:UserInstallation=${profileUri}`,
          '--headless',
          '--nologo',
          '--nofirststartwizard',
          '--norestore',
          '--convert-to',
          'ods',
          '--outdir',
          outDir,
          sourcePath
        ],
        { timeoutMs }
      );
      const base = path.parse(sourcePath).name;
      odsPath = path.join(outDir, `${base}.ods`);
      try {
        await fs.access(odsPath);
      } catch {
        const files = await fs.readdir(outDir);
        const odss = files.filter((f) => f.toLowerCase().endsWith('.ods'));
        if (odss.length !== 1) {
          throw new Error(`LibreOffice не створив ODS (${files.join(', ') || 'немає'})`);
        }
        odsPath = path.join(outDir, odss[0]);
      }
    }

    await patchOdsPageLayoutForFitWidth(odsPath);

    await run(
      'soffice',
      [
        `-env:UserInstallation=${profileUri}`,
        '--headless',
        '--nologo',
        '--nofirststartwizard',
        '--norestore',
        '--convert-to',
        CALC_PDF_FILTER,
        '--outdir',
        outDir,
        odsPath
      ],
      { timeoutMs }
    );

    const pdfPath = await findProducedPdf(outDir, `${path.parse(odsPath).name}.pdf`);
    await stripEmptyPdfPages(pdfPath).catch(() => {});
    return pdfPath;
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(sourcePath, { force: true }).catch(() => {});
  }
}

async function convertWithLibreOffice(inputPath, outDir, { quick = false } = {}) {
  return enqueueLibreOffice(async () => {
    const ext = path.extname(inputPath) || '.docx';
    const extKey = ext.replace(/^\./, '').toLowerCase();
    if (CALC_EXT.has(extKey)) {
      return convertCalcToPdf(inputPath, outDir, { quick });
    }

    await fs.mkdir(outDir, { recursive: true });
    const workInput = path.join(outDir, `source${ext}`);
    await fs.copyFile(inputPath, workInput);

    const profileDir = path.join(
      outDir,
      `lo-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    await fs.mkdir(profileDir, { recursive: true });
    const profileUri = pathToFileURL(profileDir).href;

    try {
      await run(
        'soffice',
        [
          `-env:UserInstallation=${profileUri}`,
          '--headless',
          '--nologo',
          '--nofirststartwizard',
          '--norestore',
          '--convert-to',
          'pdf',
          '--outdir',
          outDir,
          workInput
        ],
        { timeoutMs: quick ? 120000 : 300000 }
      );
      return findProducedPdf(outDir, 'source.pdf');
    } finally {
      await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
      await fs.rm(workInput, { force: true }).catch(() => {});
    }
  });
}

async function convertImageToPdf(inputPath, outPath, { quick = false } = {}) {
  let pipeline = sharp(inputPath).rotate();
  if (quick) {
    pipeline = pipeline.resize({
      width: 1200,
      height: 1200,
      fit: 'inside',
      withoutEnlargement: true
    });
  }
  const png = await pipeline.png({ quality: quick ? 60 : 90, compressionLevel: quick ? 8 : 6 }).toBuffer();
  const meta = await sharp(png).metadata();
  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(png);
  const width = meta.width || img.width;
  const height = meta.height || img.height;
  const page = pdf.addPage([width, height]);
  page.drawImage(img, { x: 0, y: 0, width, height });
  const bytes = await pdf.save({ useObjectStreams: quick });
  await fs.writeFile(outPath, bytes);
  return outPath;
}

async function convertTextToPdf(inputPath, outPath, { quick = false } = {}) {
  let raw = await fs.readFile(inputPath, 'utf8');
  if (quick && raw.length > 20000) {
    raw = `${raw.slice(0, 20000)}\n…`;
  }
  const pdf = await PDFDocument.create();
  const font = await resolveDocumentFont(pdf);
  const margin = 48;
  const fontSize = quick ? 10 : 11;
  const lineHeight = quick ? 12 : 14;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const maxWidth = pageWidth - margin * 2;
  const maxPages = quick ? 5 : Infinity;

  const wrapLine = (line) => {
    if (!line) return [''];
    const words = line.split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
        cur = next;
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  };

  let page = pdf.addPage([pageWidth, pageHeight]);
  let pageIndex = 1;
  let y = pageHeight - margin;

  outer: for (const paragraph of raw.replace(/\r\n/g, '\n').split('\n')) {
    for (const line of wrapLine(paragraph)) {
      if (y < margin) {
        if (pageIndex >= maxPages) break outer;
        page = pdf.addPage([pageWidth, pageHeight]);
        pageIndex += 1;
        y = pageHeight - margin;
      }
      page.drawText(line, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1)
      });
      y -= lineHeight;
    }
  }

  const bytes = await pdf.save();
  await fs.writeFile(outPath, bytes);
  return outPath;
}

async function convertDjvuToPdf(inputPath, outPath, { quick = false } = {}) {
  const quality = quick ? '40' : '85';
  await run('ddjvu', ['-format=pdf', `-quality=${quality}`, inputPath, outPath], {
    timeoutMs: 180000
  });
  await fs.access(outPath);
  return outPath;
}

/**
 * Convert a file to PDF. Returns absolute path to PDF.
 * @param {{ quick?: boolean }} options quick = lower quality / fewer pages for preview
 */
export async function convertToPdf(inputPath, workDir, options = {}) {
  const { quick = false } = options;
  const name = path.basename(inputPath);
  const ext = extOf(name);
  const category = fileCategory(name);
  const outPdf = path.join(workDir, `${path.parse(name).name}.pdf`);

  if (ext === 'pdf') {
    await fs.copyFile(inputPath, outPdf);
    await normalizePdf(outPdf);
    return outPdf;
  }

  if (IMAGE_EXT.has(ext) || category === 'image') {
    return convertImageToPdf(inputPath, outPdf, { quick });
  }

  if (DJVU_EXT.has(ext)) {
    return convertDjvuToPdf(inputPath, outPdf, { quick });
  }

  if (TEXT_EXT.has(ext) || category === 'text') {
    return convertTextToPdf(inputPath, outPdf, { quick });
  }

  if (OFFICE_EXT.has(ext) || category === 'office' || category === 'other') {
    return convertWithLibreOffice(inputPath, workDir, { quick });
  }

  throw new Error(`Unsupported format: .${ext}`);
}
