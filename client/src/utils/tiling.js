/**
 * Client-side tiling from primary element (CSS top-left coords).
 * Ghosts only; primary is rendered separately.
 * Partitions that intersect the page (incl. partial edge overflow) are kept;
 * stage clips overflow.
 */

/** Axis-aligned size of a box after rotation (degrees). */
export function rotatedAabb(boxW, boxH, rotationDeg = 0) {
  const deg = Number(rotationDeg);
  const rad = (((Number.isFinite(deg) ? deg : 0) % 180) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return {
    w: boxW * c + boxH * s,
    h: boxW * s + boxH * c
  };
}

/**
 * Pattern spacing:
 * - tile: dense packing (wallpaper)
 * - grid: sparse regular lattice
 * - diagonal: brick offset with room so rotated copies do not overlap
 * spacingX / spacingY: extra gap between copies (CSS px or PDF pt).
 */
export function stepsForPattern(
  pattern,
  boxW,
  boxH,
  rotationDeg = 0,
  spacingX = 0,
  spacingY = 0
) {
  const { w: aw, h: ah } = rotatedAabb(boxW, boxH, rotationDeg);
  const gapX = Number(spacingX) || 0;
  const gapY = Number(spacingY) || 0;

  let stepX;
  let stepY;
  if (pattern === 'tile') {
    stepX = Math.max(aw * 1.1, aw + 8);
    stepY = Math.max(ah * 1.1, ah + 8);
  } else if (pattern === 'grid') {
    stepX = Math.max(aw * 2.05, aw + 56);
    stepY = Math.max(ah * 2.05, ah + 56);
  } else if (pattern === 'diagonal') {
    stepX = Math.max(aw * 1.65, aw + 28);
    stepY = Math.max(ah * 1.75, ah + 32);
  } else {
    stepX = Math.max(aw * 1.35, aw + 16);
    stepY = Math.max(ah * 1.35, ah + 16);
  }

  return {
    stepX: Math.max(1, stepX + gapX),
    stepY: Math.max(1, stepY + gapY)
  };
}

/** True if the rotated box (same center) intersects the page — centers may be off-page. */
export function intersectsPageRotated(left, top, boxW, boxH, pageW, pageH, rotationDeg = 0) {
  const { w: aw, h: ah } = rotatedAabb(boxW, boxH, rotationDeg);
  const cx = left + boxW / 2;
  const cy = top + boxH / 2;
  const rLeft = cx - aw / 2;
  const rTop = cy - ah / 2;
  return rLeft < pageW && rTop < pageH && rLeft + aw > 0 && rTop + ah > 0;
}

export function tileGhostsFromPrimary({
  pattern,
  pageW,
  pageH,
  primaryLeft,
  primaryTop,
  boxW,
  boxH,
  rotationDeg = 0,
  spacingX = 0,
  spacingY = 0
}) {
  if (!pattern || pattern === 'single') return [];

  const { stepX, stepY } = stepsForPattern(
    pattern,
    boxW,
    boxH,
    rotationDeg,
    spacingX,
    spacingY
  );
  const { w: aw, h: ah } = rotatedAabb(boxW, boxH, rotationDeg);
  const positions = [];
  // Cover page plus one full rotated footprint beyond each edge
  const maxI = Math.ceil((pageW + aw) / stepX) + 2;
  const maxJ = Math.ceil((pageH + ah) / stepY) + 2;

  for (let j = -maxJ; j <= maxJ; j++) {
    for (let i = -maxI; i <= maxI; i++) {
      if (i === 0 && j === 0) continue;
      let left = primaryLeft + i * stepX;
      let top = primaryTop + j * stepY;
      if (pattern === 'diagonal') {
        left += j % 2 !== 0 ? stepX / 2 : 0;
      }
      if (intersectsPageRotated(left, top, boxW, boxH, pageW, pageH, rotationDeg)) {
        positions.push({ left, top, w: boxW, h: boxH });
      }
    }
  }

  return positions;
}
