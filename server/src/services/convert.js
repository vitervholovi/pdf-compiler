import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { extOf, fileCategory, IMAGE_EXT, DJVU_EXT, TEXT_EXT, OFFICE_EXT } from '../utils/mime.js';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function convertWithLibreOffice(inputPath, outDir) {
  await run('soffice', [
    '--headless',
    '--nologo',
    '--nofirststartwizard',
    '--convert-to', 'pdf',
    '--outdir', outDir,
    inputPath
  ], { timeout: 180000 });
  const base = path.basename(inputPath, path.extname(inputPath));
  const outPath = path.join(outDir, `${base}.pdf`);
  await fs.access(outPath);
  return outPath;
}

async function convertImageToPdf(inputPath, outPath) {
  const png = await sharp(inputPath).rotate().png().toBuffer();
  const meta = await sharp(png).metadata();
  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(png);
  const width = meta.width || img.width;
  const height = meta.height || img.height;
  const page = pdf.addPage([width, height]);
  page.drawImage(img, { x: 0, y: 0, width, height });
  const bytes = await pdf.save();
  await fs.writeFile(outPath, bytes);
  return outPath;
}

async function convertTextToPdf(inputPath, outPath) {
  const raw = await fs.readFile(inputPath, 'utf8');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const margin = 48;
  const fontSize = 11;
  const lineHeight = 14;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const maxWidth = pageWidth - margin * 2;

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
  let y = pageHeight - margin;

  for (const paragraph of raw.replace(/\r\n/g, '\n').split('\n')) {
    for (const line of wrapLine(paragraph)) {
      if (y < margin) {
        page = pdf.addPage([pageWidth, pageHeight]);
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

async function convertDjvuToPdf(inputPath, outPath) {
  await run('ddjvu', ['-format=pdf', '-quality=85', inputPath, outPath]);
  await fs.access(outPath);
  return outPath;
}

/**
 * Convert a file to PDF. Returns absolute path to PDF.
 */
export async function convertToPdf(inputPath, workDir) {
  const name = path.basename(inputPath);
  const ext = extOf(name);
  const category = fileCategory(name);
  const outPdf = path.join(workDir, `${path.parse(name).name}.pdf`);

  if (ext === 'pdf') {
    await fs.copyFile(inputPath, outPdf);
    return outPdf;
  }

  if (IMAGE_EXT.has(ext) || category === 'image') {
    return convertImageToPdf(inputPath, outPdf);
  }

  if (DJVU_EXT.has(ext)) {
    return convertDjvuToPdf(inputPath, outPdf);
  }

  if (TEXT_EXT.has(ext) || category === 'text') {
    return convertTextToPdf(inputPath, outPdf);
  }

  if (OFFICE_EXT.has(ext) || category === 'office' || category === 'other') {
    return convertWithLibreOffice(inputPath, workDir);
  }

  throw new Error(`Unsupported format: .${ext}`);
}
