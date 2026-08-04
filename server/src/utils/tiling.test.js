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
  // primary is included in PDF helper
  assert.ok(positions.some((p) => p.x === 150 && p.y === 150));
  // a neighbor that only partially fits should still appear
  assert.ok(positions.length > 1);
});
