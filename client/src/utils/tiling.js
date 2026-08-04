/**
 * Client-side tiling from primary element (CSS top-left coords).
 * Ghosts only; primary is rendered separately.
 */
export function tileGhostsFromPrimary({
  pattern,
  pageW,
  pageH,
  primaryLeft,
  primaryTop,
  boxW,
  boxH
}) {
  if (!pattern || pattern === 'single') return [];

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
      if (fullyInside(left, top)) {
        positions.push({ left, top, w: boxW, h: boxH });
      }
    }
  }

  return positions;
}
