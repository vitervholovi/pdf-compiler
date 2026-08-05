/**
 * Shared watermark placement helpers (orientation slots).
 * Style/layout fields live per portrait|landscape; content toggles stay on the layer.
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
    fontFamily: 'Helvetica',
    bold: true,
    italic: false,
    underline: false,
    color: '#000000',
    opacity: 0.25,
    align: 'center',
    pattern: 'single',
    transform: defaultTransform(rotationDeg)
  };
}

export function defaultImagePlacement(rotationDeg = 0) {
  return {
    spacingX: 0,
    spacingY: 0,
    opacity: 0.3,
    grayscale: false,
    pattern: 'single',
    transform: { xPct: 0.5, yPct: 0.5, wPct: 0.35, rotationDeg }
  };
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function pickNum(src, legacy, key, fallback) {
  if (src[key] != null && Number.isFinite(Number(src[key]))) return Number(src[key]);
  if (legacy[key] != null && Number.isFinite(Number(legacy[key]))) return Number(legacy[key]);
  return fallback;
}

function pickBool(src, legacy, key, fallback) {
  if (src[key] !== undefined) return !!src[key];
  if (legacy[key] !== undefined) return !!legacy[key];
  return fallback;
}

function pickStr(src, legacy, key, fallback) {
  if (src[key] != null && src[key] !== '') return String(src[key]);
  if (legacy[key] != null && legacy[key] !== '') return String(legacy[key]);
  return fallback;
}

/** Normalize one text orientation slot; migrate legacy flat layer fields. */
export function normalizeTextPlacement(raw, legacyLayer = {}) {
  const d = defaultTextPlacement();
  const src = raw && typeof raw === 'object' ? raw : {};
  const legacyTransform = legacyLayer.transform || {};
  return {
    fontSizePt: pickNum(src, legacyLayer, 'fontSizePt', d.fontSizePt),
    spacingX: pickNum(src, legacyLayer, 'spacingX', d.spacingX),
    spacingY: pickNum(src, legacyLayer, 'spacingY', d.spacingY),
    fontFamily: pickStr(src, legacyLayer, 'fontFamily', d.fontFamily),
    bold: pickBool(src, legacyLayer, 'bold', d.bold),
    italic: pickBool(src, legacyLayer, 'italic', d.italic),
    underline: pickBool(src, legacyLayer, 'underline', d.underline),
    color: pickStr(src, legacyLayer, 'color', d.color),
    opacity: pickNum(src, legacyLayer, 'opacity', d.opacity),
    align: pickStr(src, legacyLayer, 'align', d.align),
    pattern: pickStr(src, legacyLayer, 'pattern', d.pattern),
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
    spacingX: pickNum(src, legacyLayer, 'spacingX', d.spacingX),
    spacingY: pickNum(src, legacyLayer, 'spacingY', d.spacingY),
    opacity: pickNum(src, legacyLayer, 'opacity', d.opacity),
    grayscale: pickBool(src, legacyLayer, 'grayscale', d.grayscale),
    pattern: pickStr(src, legacyLayer, 'pattern', d.pattern),
    transform: {
      ...d.transform,
      ...legacyTransform,
      ...(src.transform || {})
    }
  };
}

export function getTextPlacement(textLayer, orientation = 'portrait') {
  const ori = orientation === 'landscape' ? 'landscape' : 'portrait';
  if (textLayer?.[ori] && typeof textLayer[ori] === 'object') {
    return normalizeTextPlacement(textLayer[ori], textLayer);
  }
  return normalizeTextPlacement(null, textLayer || {});
}

export function getImagePlacement(imageLayer, orientation = 'portrait') {
  const ori = orientation === 'landscape' ? 'landscape' : 'portrait';
  if (imageLayer?.[ori] && typeof imageLayer[ori] === 'object') {
    return normalizeImagePlacement(imageLayer[ori], imageLayer);
  }
  return normalizeImagePlacement(null, imageLayer || {});
}

export function defaultWatermark() {
  return {
    text: {
      enabled: true,
      value: 'CONFIDENTIAL',
      /** Rasterize text → PNG then overlay (server); default on */
      asGraphic: true,
      portrait: defaultTextPlacement(-30),
      landscape: defaultTextPlacement(-30)
    },
    image: {
      enabled: false,
      portrait: defaultImagePlacement(0),
      landscape: defaultImagePlacement(0)
    }
  };
}

/** Shared layer keys that belong in orientation slots (stripped from shared copy). */
const TEXT_SLOT_KEYS = [
  'transform',
  'spacingX',
  'spacingY',
  'fontSizePt',
  'fontFamily',
  'bold',
  'italic',
  'underline',
  'color',
  'opacity',
  'align',
  'pattern'
];

const IMAGE_SLOT_KEYS = [
  'transform',
  'spacingX',
  'spacingY',
  'opacity',
  'grayscale',
  'pattern'
];

function omitKeys(obj, keys) {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  delete out.portrait;
  delete out.landscape;
  return out;
}

/** Merge loaded JSON with defaults so older presets still work. */
export function normalizeWatermark(raw) {
  const d = defaultWatermark();
  if (!raw || typeof raw !== 'object') return d;

  const textIn = raw.text || {};
  const imageIn = raw.image || {};
  const textShared = omitKeys(textIn, TEXT_SLOT_KEYS);
  const imageShared = omitKeys(imageIn, IMAGE_SLOT_KEYS);

  return {
    text: {
      ...d.text,
      ...textShared,
      asGraphic: textShared.asGraphic !== undefined ? !!textShared.asGraphic : d.text.asGraphic,
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
