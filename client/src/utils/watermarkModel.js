/**
 * Shared watermark placement helpers (orientation slots).
 */

export function pageOrientation(width, height) {
  return Number(width) >= Number(height) ? 'landscape' : 'portrait';
}

export function defaultTransform(rotationDeg = -30) {
  return { xPct: 0.5, yPct: 0.5, wPct: 0.5, rotationDeg };
}

export function defaultTextPlacement(rotationDeg = -30) {
  return {
    fontSizePt: 48,
    spacingX: 0,
    spacingY: 0,
    transform: defaultTransform(rotationDeg)
  };
}

export function defaultImagePlacement(rotationDeg = 0) {
  return {
    spacingX: 0,
    spacingY: 0,
    transform: { xPct: 0.5, yPct: 0.5, wPct: 0.35, rotationDeg }
  };
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Normalize one text/image orientation slot; migrate legacy flat fields. */
export function normalizeTextPlacement(raw, legacyLayer = {}) {
  const d = defaultTextPlacement();
  const src = raw && typeof raw === 'object' ? raw : {};
  const legacyTransform = legacyLayer.transform || {};
  return {
    fontSizePt:
      src.fontSizePt != null
        ? Number(src.fontSizePt)
        : legacyLayer.fontSizePt != null
          ? Number(legacyLayer.fontSizePt)
          : d.fontSizePt,
    spacingX:
      src.spacingX != null
        ? Number(src.spacingX)
        : legacyLayer.spacingX != null
          ? Number(legacyLayer.spacingX)
          : d.spacingX,
    spacingY:
      src.spacingY != null
        ? Number(src.spacingY)
        : legacyLayer.spacingY != null
          ? Number(legacyLayer.spacingY)
          : d.spacingY,
    transform: {
      ...d.transform,
      ...legacyTransform,
      ...(src.transform || {})
    }
  };
}

export function normalizeImagePlacement(raw, legacyLayer = {}) {
  const d = defaultImagePlacement();
  const src = raw && typeof raw === 'object' ? raw : {};
  const legacyTransform = legacyLayer.transform || {};
  return {
    spacingX:
      src.spacingX != null
        ? Number(src.spacingX)
        : legacyLayer.spacingX != null
          ? Number(legacyLayer.spacingX)
          : d.spacingX,
    spacingY:
      src.spacingY != null
        ? Number(src.spacingY)
        : legacyLayer.spacingY != null
          ? Number(legacyLayer.spacingY)
          : d.spacingY,
    transform: {
      ...d.transform,
      ...legacyTransform,
      ...(src.transform || {})
    }
  };
}

export function getTextPlacement(textLayer, orientation = 'portrait') {
  const ori = orientation === 'landscape' ? 'landscape' : 'portrait';
  if (textLayer?.[ori]?.transform) {
    return normalizeTextPlacement(textLayer[ori], textLayer);
  }
  return normalizeTextPlacement(null, textLayer || {});
}

export function getImagePlacement(imageLayer, orientation = 'portrait') {
  const ori = orientation === 'landscape' ? 'landscape' : 'portrait';
  if (imageLayer?.[ori]?.transform) {
    return normalizeImagePlacement(imageLayer[ori], imageLayer);
  }
  return normalizeImagePlacement(null, imageLayer || {});
}

export function defaultWatermark() {
  return {
    text: {
      enabled: true,
      value: 'CONFIDENTIAL',
      fontFamily: 'Helvetica',
      bold: true,
      italic: false,
      underline: false,
      color: '#000000',
      opacity: 0.25,
      align: 'center',
      pattern: 'single',
      portrait: defaultTextPlacement(-30),
      landscape: defaultTextPlacement(-30)
    },
    image: {
      enabled: false,
      opacity: 0.3,
      grayscale: false,
      pattern: 'single',
      portrait: defaultImagePlacement(0),
      landscape: defaultImagePlacement(0)
    }
  };
}

/** Merge loaded JSON with defaults so older presets still work. */
export function normalizeWatermark(raw) {
  const d = defaultWatermark();
  if (!raw || typeof raw !== 'object') return d;

  const textIn = raw.text || {};
  const imageIn = raw.image || {};

  // Strip legacy placement fields from the shared layer copy
  const {
    transform: _t1,
    spacingX: _sx1,
    spacingY: _sy1,
    fontSizePt: _fs1,
    portrait: _p1,
    landscape: _l1,
    ...textShared
  } = textIn;

  const {
    transform: _t2,
    spacingX: _sx2,
    spacingY: _sy2,
    portrait: _p2,
    landscape: _l2,
    ...imageShared
  } = imageIn;

  return {
    text: {
      ...d.text,
      ...textShared,
      portrait: normalizeTextPlacement(textIn.portrait, textIn),
      landscape: normalizeTextPlacement(
        textIn.landscape || (textIn.portrait ? clone(textIn.portrait) : null),
        textIn
      )
    },
    image: {
      ...d.image,
      ...imageShared,
      portrait: normalizeImagePlacement(imageIn.portrait, imageIn),
      landscape: normalizeImagePlacement(
        imageIn.landscape || (imageIn.portrait ? clone(imageIn.portrait) : null),
        imageIn
      )
    }
  };
}
