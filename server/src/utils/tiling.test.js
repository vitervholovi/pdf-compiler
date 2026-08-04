import test from 'node:test';
import assert from 'node:assert/strict';
import { stepsForPattern, tilePositionsPdf, tilePositionsFromPrimary } from './tiling.js';

test('tile and grid have different spacing', () => {
  const tile = stepsForPattern('tile', 100, 40, 0);
  const grid = stepsForPattern('grid', 100, 40, 0);
  assert.ok(tile.stepX < grid.stepX, 'tile should be denser than grid on X');
  assert.ok(tile.stepY < grid.stepY, 'tile should be denser than grid on Y');
});

test('diagonal uses brick offset and keeps spacing', () => {
  const diag = stepsForPattern('diagonal', 100, 40, -30);
  const tile = stepsForPattern('tile', 100, 40, -30);
  assert.ok(diag.stepY >= tile.stepY, 'diagonal should not be denser than tile');

  const positions = tilePositionsFromPrimary({
    pattern: 'diagonal',
    pageW: 600,
    pageH: 800,
    primaryLeft: 200,
    primaryTop: 300,
    boxW: 100,
    boxH: 40,
    rotationDeg: 0
  });
  assert.ok(positions.length > 0);

  const step = stepsForPattern('diagonal', 100, 40, 0);
  const nextRow = positions.find(
    (p) => Math.abs(p.top - (300 + step.stepY)) < 0.5 && Math.abs(p.left - (200 + step.stepX / 2)) < 0.5
  );
  assert.ok(nextRow, 'odd row should be offset by half stepX');
});

test('extra spacing increases steps', () => {
  const base = stepsForPattern('tile', 100, 40, 0, 0, 0);
  const spaced = stepsForPattern('tile', 100, 40, 0, 50, 30);
  assert.equal(spaced.stepX, base.stepX + 50);
  assert.equal(spaced.stepY, base.stepY + 30);
});

test('negative spacing shrinks steps but stays positive', () => {
  const base = stepsForPattern('tile', 100, 40, 0, 0, 0);
  const spaced = stepsForPattern('tile', 100, 40, 0, -20, -1000);
  assert.equal(spaced.stepX, base.stepX - 20);
  assert.ok(spaced.stepY >= 1);
});

test('PDF tiling moves down visually (decreasing y)', () => {
  const positions = tilePositionsPdf({
    pattern: 'tile',
    pageW: 600,
    pageH: 800,
    primaryX: 200,
    primaryY: 400,
    boxW: 80,
    boxH: 40,
    rotationDeg: 0,
    spacingX: 0,
    spacingY: 0
  });
  const { stepY } = stepsForPattern('tile', 80, 40, 0);
  const below = positions.find(
    (p) => Math.abs(p.x - 200) < 0.5 && Math.abs(p.y - (400 - stepY)) < 0.5
  );
  assert.ok(below, 'next row should decrease PDF y (visual down)');
});

test('partial overflow tiles are kept (clipped later)', () => {
  const positions = tilePositionsPdf({
    pattern: 'tile',
    pageW: 200,
    pageH: 200,
    primaryX: 150,
    primaryY: 150,
    boxW: 80,
    boxH: 80,
    rotationDeg: 0
  });
  assert.ok(positions.some((p) => p.x === 150 && p.y === 150));
  assert.ok(positions.length > 1);
});

test('tile with center outside page but overlapping edge is kept', () => {
  const positions = tilePositionsFromPrimary({
    pattern: 'tile',
    pageW: 200,
    pageH: 200,
    primaryLeft: 100,
    primaryTop: 100,
    boxW: 60,
    boxH: 40,
    rotationDeg: 0
  });
  // A neighbor that sits partly past the right edge should still be present
  const edge = positions.find((p) => p.left > 150 && p.left < 200);
  assert.ok(edge || positions.some((p) => p.left + p.w > 200), 'edge-overlapping tile expected');
});
