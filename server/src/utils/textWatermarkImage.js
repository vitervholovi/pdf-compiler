/**
 * Rasterize watermark text to PNG (SVG → sharp) for graphic overlay.
 */
import sharp from 'sharp';
import { resolveWatermarkFontFile } from './fonts.js';

function splitLines(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hexColor(hex = '#000000') {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return '#000000';
  return `#${full}`;
}

/**
 * Approximate text block size using pdf-lib font metrics (PDF pt).
 */
export function measureTextBlockPdf(font, lines, fontSize, lineHeight) {
  let maxW = 0;
  for (const line of lines) {
    maxW = Math.max(maxW, font.widthOfTextAtSize(line || ' ', fontSize));
  }
  const h = Math.max(fontSize, lines.length * lineHeight);
  return { w: Math.max(1, maxW), h };
}

/**
 * Render text watermark to PNG buffer.
 * @returns {Promise<{ png: Buffer, widthPt: number, heightPt: number }>}
 */
export async function renderTextWatermarkPng({
  text,
  fontSizePt = 48,
  fontFamily = 'Helvetica',
  bold = false,
  italic = false,
  underline = false,
  color = '#000000',
  align = 'center',
  /** pdf-lib font used only for width metrics */
  measureFont = null,
  scale = 2
}) {
  const lines = splitLines(text);
  const fontSize = Math.max(6, Number(fontSizePt) || 48);
  const lineHeight = fontSize * 1.25;
  const pad = Math.max(2, fontSize * 0.08);

  let widthPt;
  let heightPt;
  if (measureFont) {
    const m = measureTextBlockPdf(measureFont, lines, fontSize, lineHeight);
    widthPt = m.w + pad * 2;
    heightPt = m.h + pad * 2;
  } else {
    // Fallback: ~0.55em average glyph width
    const maxChars = Math.max(1, ...lines.map((l) => (l || ' ').length));
    widthPt = maxChars * fontSize * 0.55 + pad * 2;
    heightPt = Math.max(fontSize, lines.length * lineHeight) + pad * 2;
  }

  const wPx = Math.ceil(widthPt * scale);
  const hPx = Math.ceil(heightPt * scale);
  const fsPx = fontSize * scale;
  const lhPx = lineHeight * scale;
  const padPx = pad * scale;
  const fill = hexColor(color);
  const fontFile = await resolveWatermarkFontFile({
    fontFamily,
    bold,
    italic,
    text
  });

  const fontFace = fontFile
    ? `@font-face{font-family:'WmRaster';src:url('${escapeXml(
        pathToFileUrl(fontFile)
      )}');}`
    : '';
  const family = fontFile ? 'WmRaster' : 'DejaVu Sans, Liberation Sans, Arial, sans-serif';
  const weight = bold ? '700' : '400';
  const style = italic ? 'italic' : 'normal';
  const textAnchor =
    align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const xForAlign =
    align === 'left' ? padPx : align === 'right' ? wPx - padPx : wPx / 2;

  const textNodes = lines
    .map((line, i) => {
      const y = padPx + (i + 1) * lhPx - (lhPx - fsPx) * 0.5;
      const content = escapeXml(line || ' ');
      const underlineEl =
        underline && line
          ? `<line x1="${alignX1(align, xForAlign, line, fsPx, measureFont, fontSize, scale, padPx, wPx)}" y1="${
              y + fsPx * 0.12
            }" x2="${alignX2(align, xForAlign, line, fsPx, measureFont, fontSize, scale, padPx, wPx)}" y2="${
              y + fsPx * 0.12
            }" stroke="${fill}" stroke-width="${Math.max(1, fsPx * 0.055)}"/>`
          : '';
      return `<text x="${xForAlign}" y="${y}" text-anchor="${textAnchor}" font-family="${family}" font-size="${fsPx}" font-weight="${weight}" font-style="${style}" fill="${fill}">${content}</text>${underlineEl}`;
    })
    .join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${wPx}" height="${hPx}">
  <defs><style type="text/css"><![CDATA[${fontFace}]]></style></defs>
  ${textNodes}
</svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { png, widthPt, heightPt };
}

function pathToFileUrl(filePath) {
  const normalized = String(filePath).replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized.startsWith('/') ? '' : '/'}${normalized}`;
}

function lineWidthPt(measureFont, line, fontSize) {
  if (measureFont) return measureFont.widthOfTextAtSize(line || ' ', fontSize);
  return (line || ' ').length * fontSize * 0.55;
}

function alignX1(align, xForAlign, line, fsPx, measureFont, fontSize, scale, padPx, wPx) {
  const w = lineWidthPt(measureFont, line, fontSize) * scale;
  if (align === 'left') return padPx;
  if (align === 'right') return wPx - padPx - w;
  return xForAlign - w / 2;
}

function alignX2(align, xForAlign, line, fsPx, measureFont, fontSize, scale, padPx, wPx) {
  const w = lineWidthPt(measureFont, line, fontSize) * scale;
  if (align === 'left') return padPx + w;
  if (align === 'right') return wPx - padPx;
  return xForAlign + w / 2;
}
