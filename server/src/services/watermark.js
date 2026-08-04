import fs from 'fs/promises';
import sharp from 'sharp';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { tilePositionsPdf } from '../utils/tiling.js';
import { resolveWatermarkFont } from '../utils/fonts.js';

function hexToRgb(hex = '#000000') {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255
  };
}

/**
 * Apply text and/or image watermark layers onto a PDF file.
 */
export async function applyWatermark(pdfPath, outPath, watermark, imagePath) {
  const bytes = await fs.readFile(pdfPath);
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdf.getPages();

  const textLayer = watermark?.text;
  const imageLayer = watermark?.image;

  let embeddedImage = null;
  if (imageLayer?.enabled && imagePath) {
    let buf = await fs.readFile(imagePath);
    if (imageLayer.grayscale) {
      buf = await sharp(buf).grayscale().png().toBuffer();
      embeddedImage = await pdf.embedPng(buf);
    } else {
      const meta = await sharp(buf).metadata();
      if (meta.format === 'jpeg' || meta.format === 'jpg') {
        embeddedImage = await pdf.embedJpg(buf);
      } else {
        const png = await sharp(buf).png().toBuffer();
        embeddedImage = await pdf.embedPng(png);
      }
    }
  }

  let font = null;
  if (textLayer?.enabled && textLayer.value) {
    font = await resolveWatermarkFont(pdf, {
      fontFamily: textLayer.fontFamily,
      bold: textLayer.bold,
      italic: textLayer.italic
    });
  }

  for (const page of pages) {
    const { width: pageW, height: pageH } = page.getSize();

    if (imageLayer?.enabled && embeddedImage) {
      const t = imageLayer.transform || {};
      const wPct = Math.min(Math.max(Number(t.wPct) || 0.35, 0.05), 1);
      const w = pageW * wPct;
      const aspect = embeddedImage.height / embeddedImage.width || 0.75;
      const h = w * aspect;
      const xPct = t.xPct != null ? Number(t.xPct) : 0.5;
      const yPct = t.yPct != null ? Number(t.yPct) : 0.5;
      const rotation = Number(t.rotationDeg) || 0;
      const opacity = Math.min(Math.max(Number(imageLayer.opacity) ?? 0.3, 0), 1);
      const pattern = imageLayer.pattern || 'single';
      const primaryX = pageW * xPct - w / 2;
      const primaryY = pageH * (1 - yPct) - h / 2;

      const positions = tilePositionsPdf({
        pattern,
        pageW,
        pageH,
        primaryX,
        primaryY,
        boxW: w,
        boxH: h
      });

      for (const pos of positions) {
        page.drawImage(embeddedImage, {
          x: pos.x,
          y: pos.y,
          width: w,
          height: h,
          opacity,
          rotate: degrees(rotation)
        });
      }
    }

    if (textLayer?.enabled && textLayer.value && font) {
      const t = textLayer.transform || {};
      const fontSize = Number(textLayer.fontSizePt) || 48;
      const text = String(textLayer.value);
      const textW = font.widthOfTextAtSize(text, fontSize);
      const textH = fontSize;
      const xPct = t.xPct != null ? Number(t.xPct) : 0.5;
      const yPct = t.yPct != null ? Number(t.yPct) : 0.5;
      const rotation = Number(t.rotationDeg) || -30;
      const opacity = Math.min(Math.max(Number(textLayer.opacity) ?? 0.25, 0), 1);
      const color = hexToRgb(textLayer.color || '#000000');
      const pattern = textLayer.pattern || 'single';
      const underline = !!textLayer.underline;
      const primaryX = pageW * xPct - textW / 2;
      const primaryY = pageH * (1 - yPct) - textH / 2;
      const fill = rgb(color.r, color.g, color.b);
      const rot = degrees(rotation);

      const positions = tilePositionsPdf({
        pattern,
        pageW,
        pageH,
        primaryX,
        primaryY,
        boxW: textW,
        boxH: textH
      });

      for (const pos of positions) {
        page.drawText(text, {
          x: pos.x,
          y: pos.y,
          size: fontSize,
          font,
          color: fill,
          opacity,
          rotate: rot
        });

        if (underline) {
          const thickness = Math.max(0.7, fontSize * 0.055);
          page.drawRectangle({
            x: pos.x,
            y: pos.y - fontSize * 0.14,
            width: textW,
            height: thickness,
            color: fill,
            opacity,
            borderWidth: 0,
            rotate: rot
          });
        }
      }
    }
  }

  const out = await pdf.save();
  await fs.writeFile(outPath, out);
  return outPath;
}
