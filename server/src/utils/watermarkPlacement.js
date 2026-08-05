/**
 * Placement helpers for server-side watermark (mirrors client watermarkModel slots).
 */

import { pageOrientation } from './pageCoords.js';

export { pageOrientation };

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v, fallback) {
  if (v == null || v === '') return fallback;
  return String(v);
}

export function getTextPlacement(textLayer, orientation = 'portrait') {
  const ori = orientation === 'landscape' ? 'landscape' : 'portrait';
  const slot = textLayer?.[ori] && typeof textLayer[ori] === 'object' ? textLayer[ori] : {};
  const legacy = textLayer || {};
  const transform = {
    xPct: 0.5,
    yPct: 0.5,
    wPct: 0.5,
    rotationDeg: -30,
    ...(legacy.transform || {}),
    ...(slot.transform || {})
  };
  return {
    fontSizePt: num(slot.fontSizePt ?? legacy.fontSizePt, 48),
    spacingX: num(slot.spacingX ?? legacy.spacingX, 0),
    spacingY: num(slot.spacingY ?? legacy.spacingY, 0),
    fontFamily: str(slot.fontFamily ?? legacy.fontFamily, 'Helvetica'),
    bold: !!(slot.bold !== undefined ? slot.bold : legacy.bold),
    italic: !!(slot.italic !== undefined ? slot.italic : legacy.italic),
    underline: !!(slot.underline !== undefined ? slot.underline : legacy.underline),
    color: str(slot.color ?? legacy.color, '#000000'),
    opacity: num(slot.opacity ?? legacy.opacity, 0.25),
    align: str(slot.align ?? legacy.align, 'center'),
    pattern: str(slot.pattern ?? legacy.pattern, 'single'),
    transform
  };
}

export function getImagePlacement(imageLayer, orientation = 'portrait') {
  const ori = orientation === 'landscape' ? 'landscape' : 'portrait';
  const slot = imageLayer?.[ori] && typeof imageLayer[ori] === 'object' ? imageLayer[ori] : {};
  const legacy = imageLayer || {};
  const transform = {
    xPct: 0.5,
    yPct: 0.5,
    wPct: 0.35,
    rotationDeg: 0,
    ...(legacy.transform || {}),
    ...(slot.transform || {})
  };
  return {
    spacingX: num(slot.spacingX ?? legacy.spacingX, 0),
    spacingY: num(slot.spacingY ?? legacy.spacingY, 0),
    opacity: num(slot.opacity ?? legacy.opacity, 0.3),
    grayscale: !!(slot.grayscale !== undefined ? slot.grayscale : legacy.grayscale),
    pattern: str(slot.pattern ?? legacy.pattern, 'single'),
    transform
  };
}
