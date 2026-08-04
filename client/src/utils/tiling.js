/**
 * Client-side tiling from primary element (CSS top-left coords).
 * Ghosts only; primary is rendered separately.
 * Partitions that intersect the page are kept (stage clips overflow).
 */

/** Axis-aligned size of a box after rotation (degrees). */
export function rotatedAabb(boxW, boxH, rotationDeg = 0) {
  const rad = (((Number(rotationDeg) || 0) % 180) * Math.PI) / 180;
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
 */
export function stepsForPattern(pattern, boxW, boxH, rotationDeg = 0) {
  const { w: aw, h: ah } = rotatedAabb(boxW, boxH, rotationDeg);

  if (pattern === 'tile') {
    return {
      stepX: Math.max(aw * 1.1, aw + 8),
      stepY: Math.max(ah * 1.1, ah + 8)
    };
  }
  if (pattern === 'grid') {
    return {
      stepX: Math.max(aw * 2.05, aw + 56),
      stepY: Math.max(ah * 2.05, ah + 56)
    };
  }
  if (pattern === 'diagonal') {
    return {
      stepX: Math.max(aw * 1.65, aw + 28),
      stepY: Math.max(ah * 1.75, ah + 32)
    };
  }
  return {
    stepX: Math.max(aw * 1.35, aw + 16),
    stepY: Math.max(ah * 1.35, ah + 16)
  };
}

function intersectsPage(left, top, boxW, boxH, pageW, pageH) {
  return left < pageW && top < pageH && left + boxW > 0 && top + boxH > 0;
}

export function tileGhostsFromPrimary({
  pattern,
  pageW,
  pageH,
  primaryLeft,
  primaryTop,
  boxW,
  boxH,
  rotationDeg = 0
}) {
  if (!pattern || pattern === 'single') return [];

  const { stepX, stepY } = stepsForPattern(pattern, boxW, boxH, rotationDeg);
  const positions = [];
  const maxI = Math.ceil(pageW / stepX) + 3;
  const maxJ = Math.ceil(pageH / stepY) + 3;

  for (let j = -maxJ; j <= maxJ; j++) {
    for (let i = -maxI; i <= maxI; i++) {
      if (i === 0 && j === 0) continue;
      let left = primaryLeft + i * stepX;
      let top = primaryTop + j * stepY;
      if (pattern === 'diagonal') {
        left += j % 2 !== 0 ? stepX / 2 : 0;
      }
      if (intersectsPage(left, top, boxW, boxH, pageW, pageH)) {
        positions.push({ left, top, w: boxW, h: boxH });
      }
    }
  }

  return positions;
}
