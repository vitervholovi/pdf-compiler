import fs from 'fs/promises';
import sharp from 'sharp';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { tilePositionsFromPrimary } from '../utils/tiling.js';
import { resolveWatermarkFont } from '../utils/fonts.js';
import { getPageVisualMetrics, withVisualCoords, visualBoxToDraw } from '../utils/pageCoords.js';
import { getTextPlacement, getImagePlacement } from '../utils/watermarkPlacement.js';

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

function splitLines(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function lineWidth(font, line, fontSize) {
  return font.widthOfTextAtSize(line || ' ', fontSize);
}

function measureTextBlock(font, lines, fontSize, lineHeight) {
  let maxW = 0;
  for (const line of lines) {
    maxW = Math.max(maxW, lineWidth(font, line, fontSize));
  }
  const h = Math.max(fontSize, lines.length * lineHeight);
  return { w: Math.max(1, maxW), h };
}

function drawAlignedLine(page, {
  line,
  font,
  fontSize,
  boxX,
  boxW,
  baselineY,
  align,
  isLastLine,
  color,
  opacity,
  rot,
  underline
}) {
  const trimmed = line;
  const fullW = lineWidth(font, trimmed, fontSize);
  const words = trimmed.split(/(\s+)/).filter((p) => p.length > 0);
  const wordParts = words.filter((p) => !/^\s+$/.test(p));
  const canJustify =
    align === 'justify' && !isLastLine && wordParts.length > 1 && fullW < boxW;

  if (canJustify) {
    const contentW = wordParts.reduce((s, w) => s + lineWidth(font, w, fontSize), 0);
    const gaps = wordParts.length - 1;
    const gapW = (boxW - contentW) / gaps;
    let x = boxX;
    for (let i = 0; i < wordParts.length; i++) {
      const w = wordParts[i];
      page.drawText(w, {
        x,
        y: baselineY,
        size: fontSize,
        font,
        color,
        opacity,
        rotate: rot
      });
      x += lineWidth(font, w, fontSize) + (i < gaps ? gapW : 0);
    }
    if (underline) {
      const thickness = Math.max(0.7, fontSize * 0.055);
      page.drawRectangle({
        x: boxX,
        y: baselineY - fontSize * 0.14,
        width: boxW,
        height: thickness,
        color,
        opacity,
        borderWidth: 0,
        rotate: rot
      });
    }
    return;
  }

  let x = boxX;
  if (align === 'center') x = boxX + (boxW - fullW) / 2;
  else if (align === 'right') x = boxX + (boxW - fullW);

  page.drawText(trimmed || ' ', {
    x,
    y: baselineY,
    size: fontSize,
    font,
    color,
    opacity,
    rotate: rot
  });

  if (underline && trimmed) {
    const thickness = Math.max(0.7, fontSize * 0.055);
    page.drawRectangle({
      x,
      y: baselineY - fontSize * 0.14,
      width: fullW,
      height: thickness,
      color,
      opacity,
      borderWidth: 0,
      rotate: rot
    });
  }
}

function visualTilePositions({
  pattern,
  visualW,
  visualH,
  primaryLeft,
  primaryTop,
  boxW,
  boxH,
  rotationDeg,
  spacingX,
  spacingY
}) {
  if (!pattern || pattern === 'single') {
    return [{ left: primaryLeft, top: primaryTop, w: boxW, h: boxH }];
  }
  const ghosts = tilePositionsFromPrimary({
    pattern,
    pageW: visualW,
    pageH: visualH,
    primaryLeft,
    primaryTop,
    boxW,
    boxH,
    rotationDeg,
    spacingX,
    spacingY
  });
  return [{ left: primaryLeft, top: primaryTop, w: boxW, h: boxH }, ...ghosts];
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
  const textValue = textLayer?.enabled ? String(textLayer.value ?? '') : '';
  if (textLayer?.enabled && textValue) {
    font = await resolveWatermarkFont(pdf, {
      fontFamily: textLayer.fontFamily,
      bold: textLayer.bold,
      italic: textLayer.italic,
      text: textValue
    });
  }

  for (const page of pages) {
    const metrics = getPageVisualMetrics(page);
    const { visualW, visualH, orientation } = metrics;

    withVisualCoords(page, metrics, () => {
      if (imageLayer?.enabled && embeddedImage) {
        const place = getImagePlacement(imageLayer, orientation);
        const t = place.transform || {};
        const wPct = Math.min(Math.max(Number(t.wPct) || 0.35, 0.05), 1);
        const w = visualW * wPct;
        const aspect = embeddedImage.height / embeddedImage.width || 0.75;
        const h = w * aspect;
        const xPct = t.xPct != null ? Number(t.xPct) : 0.5;
        const yPct = t.yPct != null ? Number(t.yPct) : 0.5;
        const rotation = Number(t.rotationDeg) || 0;
        const opacity = Math.min(Math.max(Number(imageLayer.opacity) ?? 0.3, 0), 1);
        const pattern = imageLayer.pattern || 'single';
        const primaryLeft = visualW * xPct - w / 2;
        const primaryTop = visualH * yPct - h / 2;

        const positions = visualTilePositions({
          pattern,
          visualW,
          visualH,
          primaryLeft,
          primaryTop,
          boxW: w,
          boxH: h,
          rotationDeg: rotation,
          spacingX: place.spacingX,
          spacingY: place.spacingY
        });

        for (const pos of positions) {
          const draw = visualBoxToDraw(pos.left, pos.top, w, h, visualH, rotation);
          page.drawImage(embeddedImage, {
            x: draw.x,
            y: draw.y,
            width: w,
            height: h,
            opacity,
            rotate: degrees(draw.pdfRotDeg)
          });
        }
      }

      if (textLayer?.enabled && textValue && font) {
        const place = getTextPlacement(textLayer, orientation);
        const t = place.transform || {};
        const fontSize = Number(place.fontSizePt) || 48;
        const lineHeight = fontSize * 1.25;
        const lines = splitLines(textValue);
        const { w: textW, h: textH } = measureTextBlock(font, lines, fontSize, lineHeight);
        const xPct = t.xPct != null ? Number(t.xPct) : 0.5;
        const yPct = t.yPct != null ? Number(t.yPct) : 0.5;
        const rotation = Number(t.rotationDeg) || -30;
        const opacity = Math.min(Math.max(Number(textLayer.opacity) ?? 0.25, 0), 1);
        const color = hexToRgb(textLayer.color || '#000000');
        const pattern = textLayer.pattern || 'single';
        const underline = !!textLayer.underline;
        const align = textLayer.align || 'center';
        const primaryLeft = visualW * xPct - textW / 2;
        const primaryTop = visualH * yPct - textH / 2;
        const fill = rgb(color.r, color.g, color.b);

        const positions = visualTilePositions({
          pattern,
          visualW,
          visualH,
          primaryLeft,
          primaryTop,
          boxW: textW,
          boxH: textH,
          rotationDeg: rotation,
          spacingX: place.spacingX,
          spacingY: place.spacingY
        });

        for (const pos of positions) {
          const draw = visualBoxToDraw(pos.left, pos.top, textW, textH, visualH, rotation);
          const rot = degrees(draw.pdfRotDeg);

          for (let li = 0; li < lines.length; li++) {
            const baselineY =
              draw.y + textH - (li + 1) * lineHeight + (lineHeight - fontSize) * 0.5;
            drawAlignedLine(page, {
              line: lines[li],
              font,
              fontSize,
              boxX: draw.x,
              boxW: textW,
              baselineY,
              align,
              isLastLine: li === lines.length - 1,
              color: fill,
              opacity,
              rot,
              underline
            });
          }
        }
      }
    });
  }

  const out = await pdf.save();
  await fs.writeFile(outPath, out);
  return outPath;
}
