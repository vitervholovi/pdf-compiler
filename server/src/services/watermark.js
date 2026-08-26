import fs from 'fs/promises';
import sharp from 'sharp';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { tilePositionsFromPrimary } from '../utils/tiling.js';
import { resolveWatermarkFont } from '../utils/fonts.js';
import { getPageVisualMetrics, withVisualCoords, visualBoxToDraw } from '../utils/pageCoords.js';
import { getTextPlacement, getImagePlacement } from '../utils/watermarkPlacement.js';
import { renderTextWatermarkPng, measureTextBlockPdf } from '../utils/textWatermarkImage.js';
import { normalizePdf } from '../utils/normalizePdf.js';

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
  return measureTextBlockPdf(font, lines, fontSize, lineHeight);
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

function textGraphicCacheKey(place) {
  return [
    place.fontSizePt,
    place.fontFamily,
    place.bold ? 1 : 0,
    place.italic ? 1 : 0,
    place.underline ? 1 : 0,
    place.color,
    place.align,
    place.pattern
  ].join('|');
}

async function embedImageBuffer(pdf, buf, preferJpeg = false) {
  if (preferJpeg) {
    try {
      return await pdf.embedJpg(buf);
    } catch {
      /* fall through to png */
    }
  }
  const png = await sharp(buf).png().toBuffer();
  return pdf.embedPng(png);
}

/**
 * Apply text and/or image watermark layers onto a PDF file.
 */
export async function applyWatermark(pdfPath, outPath, watermark, imagePath) {
  await normalizePdf(pdfPath);
  const bytes = await fs.readFile(pdfPath);
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();

  const textLayer = watermark?.text;
  const imageLayer = watermark?.image;

  let embeddedColor = null;
  let embeddedGray = null;
  if (imageLayer?.enabled && imagePath) {
    const buf = await fs.readFile(imagePath);
    const meta = await sharp(buf).metadata();
    const isJpeg = meta.format === 'jpeg' || meta.format === 'jpg';
    embeddedColor = await embedImageBuffer(pdf, buf, isJpeg);
    const grayBuf = await sharp(buf).grayscale().png().toBuffer();
    embeddedGray = await pdf.embedPng(grayBuf);
  }

  const textValue = textLayer?.enabled ? String(textLayer.value ?? '') : '';
  const asGraphic = textLayer?.asGraphic !== false;

  const fontCache = new Map();
  async function getFont(place) {
    const key = `${place.fontFamily}|${place.bold ? 1 : 0}|${place.italic ? 1 : 0}`;
    if (fontCache.has(key)) return fontCache.get(key);
    const font = await resolveWatermarkFont(pdf, {
      fontFamily: place.fontFamily,
      bold: place.bold,
      italic: place.italic,
      text: textValue
    });
    fontCache.set(key, font);
    return font;
  }

  const textGraphicCache = new Map();
  async function getTextGraphic(place) {
    const key = textGraphicCacheKey(place);
    if (textGraphicCache.has(key)) return textGraphicCache.get(key);
    const font = await getFont(place);
    const rendered = await renderTextWatermarkPng({
      text: textValue,
      fontSizePt: place.fontSizePt,
      fontFamily: place.fontFamily,
      bold: place.bold,
      italic: place.italic,
      underline: place.underline,
      color: place.color || '#000000',
      align: place.align || 'center',
      measureFont: font
    });
    const embedded = await pdf.embedPng(rendered.png);
    const entry = { embedded, w: rendered.widthPt, h: rendered.heightPt, font };
    textGraphicCache.set(key, entry);
    return entry;
  }

  for (const page of pages) {
    const metrics = getPageVisualMetrics(page);
    const { visualW, visualH, orientation } = metrics;

    let textGraphic = null;
    let textFont = null;
    let textPlace = null;
    if (textLayer?.enabled && textValue) {
      textPlace = getTextPlacement(textLayer, orientation);
      textFont = await getFont(textPlace);
      if (asGraphic) {
        textGraphic = await getTextGraphic(textPlace);
      }
    }

    withVisualCoords(page, metrics, () => {
      if (imageLayer?.enabled && (embeddedColor || embeddedGray)) {
        const place = getImagePlacement(imageLayer, orientation);
        const embeddedImage = place.grayscale ? embeddedGray : embeddedColor;
        if (embeddedImage) {
          const t = place.transform || {};
          const wPct = Math.min(Math.max(Number(t.wPct) || 0.35, 0.05), 1);
          const w = visualW * wPct;
          const aspect = embeddedImage.height / embeddedImage.width || 0.75;
          const h = w * aspect;
          const xPct = t.xPct != null ? Number(t.xPct) : 0.5;
          const yPct = t.yPct != null ? Number(t.yPct) : 0.5;
          const rotation = Number.isFinite(Number(t.rotationDeg)) ? Number(t.rotationDeg) : 0;
          const opacity = Math.min(Math.max(Number(place.opacity) ?? 0.3, 0), 1);
          const pattern = place.pattern || 'single';
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
      }

      if (textLayer?.enabled && textValue && textPlace && textFont) {
        const place = textPlace;
        const t = place.transform || {};
        const fontSize = Number(place.fontSizePt) || 48;
        const lineHeight = fontSize * 1.25;
        const lines = splitLines(textValue);
        const xPct = t.xPct != null ? Number(t.xPct) : 0.5;
        const yPct = t.yPct != null ? Number(t.yPct) : 0.5;
        const rotation = Number.isFinite(Number(t.rotationDeg)) ? Number(t.rotationDeg) : -30;
        const opacity = Math.min(Math.max(Number(place.opacity) ?? 0.25, 0), 1);
        const pattern = place.pattern || 'single';

        if (asGraphic && textGraphic) {
          const w = textGraphic.w;
          const h = textGraphic.h;
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
            page.drawImage(textGraphic.embedded, {
              x: draw.x,
              y: draw.y,
              width: w,
              height: h,
              opacity,
              rotate: degrees(draw.pdfRotDeg)
            });
          }
        } else {
          const { w: textW, h: textH } = measureTextBlock(textFont, lines, fontSize, lineHeight);
          const color = hexToRgb(place.color || '#000000');
          const underline = !!place.underline;
          const align = place.align || 'center';
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
                font: textFont,
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
      }
    });
  }

  const out = await pdf.save();
  await fs.writeFile(outPath, out);
  return outPath;
}
