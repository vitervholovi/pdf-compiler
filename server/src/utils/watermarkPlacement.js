/**
 * Placement helpers for server-side watermark (mirrors client watermarkModel slots).
 */

import { pageOrientation } from './pageCoords.js';

export { pageOrientation };

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function getTextPlacement(textLayer, orientation = 'portrait') {
  const ori = orientation === 'landscape' ? 'landscape' : 'portrait';
  const slot = textLayer?.[ori];
  const legacy = textLayer || {};
  const transform = {
    xPct: 0.5,
    yPct: 0.5,
    wPct: 0.5,
    rotationDeg: -30,
    ...(legacy.transform || {}),
    ...(slot?.transform || {})
  };
  return {
    fontSizePt: num(slot?.fontSizePt ?? legacy.fontSizePt, 48),
    spacingX: num(slot?.spacingX ?? legacy.spacingX, 0),
    spacingY: num(slot?.spacingY ?? legacy.spacingY, 0),
    transform
  };
}

export function getImagePlacement(imageLayer, orientation = 'portrait') {
  const ori = orientation === 'landscape' ? 'landscape' : 'portrait';
  const slot = imageLayer?.[ori];
  const legacy = imageLayer || {};
  const transform = {
    xPct: 0.5,
    yPct: 0.5,
    wPct: 0.35,
    rotationDeg: 0,
    ...(legacy.transform || {}),
    ...(slot?.transform || {})
  };
  return {
    spacingX: num(slot?.spacingX ?? legacy.spacingX, 0),
    spacingY: num(slot?.spacingY ?? legacy.spacingY, 0),
    transform
  };
}
