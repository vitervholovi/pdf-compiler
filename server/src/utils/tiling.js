/**
 * Build tile positions from a primary element's top-left and size.
 * Only returns tiles fully inside the page (no overflow).
 * Skips the primary cell (0,0).
 * Coordinates: top-left origin (CSS / screen). Convert to PDF bottom-left separately.
 */
export function tilePositionsFromPrimary({
  pattern,
  pageW,
  pageH,
  primaryLeft,
  primaryTop,
  boxW,
  boxH
}) {
  if (!pattern || pattern === 'single') {
    return [];
  }

  const stepX = Math.max(boxW * 1.35, boxW + 16);
  const stepY = Math.max(boxH * 1.35, boxH + 16);
  const positions = [];

  const fullyInside = (left, top) =>
    left >= 0 && top >= 0 && left + boxW <= pageW && top + boxH <= pageH;

  const maxI = Math.ceil(pageW / stepX) + 2;
  const maxJ = Math.ceil(pageH / stepY) + 2;

  for (let j = -maxJ; j <= maxJ; j++) {
    for (let i = -maxI; i <= maxI; i++) {
      if (i === 0 && j === 0) continue;
      let left = primaryLeft + i * stepX;
      let top = primaryTop + j * stepY;
      if (pattern === 'diagonal') {
        left += (j % 2 !== 0 ? stepX / 2 : 0);
      }
      // grid and tile use same regular lattice; diagonal offsets alternate rows
      if (pattern === 'grid' || pattern === 'tile' || pattern === 'diagonal') {
        if (fullyInside(left, top)) {
          positions.push({ left, top, w: boxW, h: boxH });
        }
      }
    }
  }

  return positions;
}

/** PDF coords: y from bottom. primaryY is bottom-left of watermark box. */
export function tilePositionsPdf({
  pattern,
  pageW,
  pageH,
  primaryX,
  primaryY,
  boxW,
  boxH
}) {
  if (!pattern || pattern === 'single') {
    return [{ x: primaryX, y: primaryY }];
  }

  const stepX = Math.max(boxW * 1.35, boxW + 16);
  const stepY = Math.max(boxH * 1.35, boxH + 16);
  const positions = [{ x: primaryX, y: primaryY }];

  const fullyInside = (x, y) =>
    x >= 0 && y >= 0 && x + boxW <= pageW && y + boxH <= pageH;

  const maxI = Math.ceil(pageW / stepX) + 2;
  const maxJ = Math.ceil(pageH / stepY) + 2;

  for (let j = -maxJ; j <= maxJ; j++) {
    for (let i = -maxI; i <= maxI; i++) {
      if (i === 0 && j === 0) continue;
      let x = primaryX + i * stepX;
      let y = primaryY + j * stepY;
      if (pattern === 'diagonal') {
        x += (j % 2 !== 0 ? stepX / 2 : 0);
      }
      if (fullyInside(x, y)) {
        positions.push({ x, y });
      }
    }
  }

  return positions;
}
