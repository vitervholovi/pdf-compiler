import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPageVisualMetrics,
  visualCtm,
  visualBoxToDraw,
  pageOrientation
} from './pageCoords.js';

function fakePage(width, height, angle = 0) {
  return {
    getSize: () => ({ width, height }),
    getRotation: () => ({ angle, type: 'degrees' })
  };
}

test('pageOrientation uses width vs height', () => {
  assert.equal(pageOrientation(595, 842), 'portrait');
  assert.equal(pageOrientation(842, 595), 'landscape');
});

test('visual metrics swap for Rotate 90', () => {
  const m = getPageVisualMetrics(fakePage(595, 842, 90));
  assert.equal(m.visualW, 842);
  assert.equal(m.visualH, 595);
  assert.equal(m.orientation, 'landscape');
});

test('angle 0 CTM is identity', () => {
  assert.deepEqual(visualCtm(getPageVisualMetrics(fakePage(600, 800, 0))), [
    1, 0, 0, 1, 0, 0
  ]);
});

test('angle 90 CTM maps visual BL to media (mediaW, 0)', () => {
  const m = getPageVisualMetrics(fakePage(595, 842, 90));
  const [a, b, c, d, e, f] = visualCtm(m);
  // x' = a*x + c*y + e; y' = b*x + d*y + f
  const x0 = a * 0 + c * 0 + e;
  const y0 = b * 0 + d * 0 + f;
  assert.equal(x0, 595);
  assert.equal(y0, 0);
});

test('visualBoxToDraw uses CSS→PDF angle negation only', () => {
  const d = visualBoxToDraw(100, 50, 80, 40, 800, -30);
  assert.equal(d.x, 100);
  assert.equal(d.y, 800 - 50 - 40);
  assert.equal(d.pdfRotDeg, 30);
});
