/**
 * Map visual (viewer) page coordinates to pdf-lib media-box space.
 * Uses a CTM so draws use visual bottom-left / Y-up coords (like an unrotated page).
 */

import {
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix
} from 'pdf-lib';

export function pageOrientation(width, height) {
  return Number(width) >= Number(height) ? 'landscape' : 'portrait';
}

export function getPageVisualMetrics(page) {
  const { width: mediaW, height: mediaH } = page.getSize();
  const angle = ((Math.round(page.getRotation()?.angle || 0) % 360) + 360) % 360;
  const swapped = angle === 90 || angle === 270;
  const visualW = swapped ? mediaH : mediaW;
  const visualH = swapped ? mediaW : mediaH;
  return {
    mediaW,
    mediaH,
    visualW,
    visualH,
    angle,
    orientation: pageOrientation(visualW, visualH)
  };
}

/**
 * CTM mapping visual bottom-left Y-up → media coords.
 * After this transform, draw as on an unrotated page of size visualW×visualH.
 *
 * PDF /Rotate is clockwise when displayed. Matrices undo that for drawing.
 */
export function visualCtm(metrics) {
  const { mediaW, mediaH, angle } = metrics;
  switch (angle) {
    case 90:
      // visual (x,y) → media (mediaW - y, x)
      return [0, 1, -1, 0, mediaW, 0];
    case 180:
      // visual (x,y) → media (mediaW - x, mediaH - y)
      return [-1, 0, 0, -1, mediaW, mediaH];
    case 270:
      // visual (x,y) → media (y, mediaH - x)
      return [0, -1, 1, 0, 0, mediaH];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}

/** Run draws in visual coordinate space (bottom-left origin, Y up). */
export function withVisualCoords(page, metrics, fn) {
  const [a, b, c, d, e, f] = visualCtm(metrics);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(a, b, c, d, e, f));
  try {
    return fn(metrics.visualW, metrics.visualH);
  } finally {
    page.pushOperators(popGraphicsState());
  }
}

/**
 * Visual top-left box → draw origin in visual bottom-left Y-up space,
 * plus pdf-lib rotation (CCW) for CSS clockwise angle.
 * Call only inside withVisualCoords (page /Rotate already handled by CTM).
 */
export function visualBoxToDraw(left, top, boxW, boxH, visualH, cssRotDeg = 0) {
  return {
    x: left,
    y: visualH - top - boxH,
    pdfRotDeg: -(Number(cssRotDeg) || 0)
  };
}
