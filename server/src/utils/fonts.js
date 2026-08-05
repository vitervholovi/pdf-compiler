import fs from 'fs/promises';
import path from 'path';
import { StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const fontkitRegistered = new WeakSet();

function ensureFontkit(pdf) {
  if (!fontkitRegistered.has(pdf)) {
    pdf.registerFontkit(fontkit);
    fontkitRegistered.add(pdf);
  }
}

/**
 * Resolve a TTF path for family + style from common Linux font dirs
 * (DejaVu / Liberation — installed in Docker image).
 */
const TTF_MAP = {
  'DejaVu Sans': {
    regular: ['DejaVuSans.ttf'],
    bold: ['DejaVuSans-Bold.ttf'],
    italic: ['DejaVuSans-Oblique.ttf'],
    boldItalic: ['DejaVuSans-BoldOblique.ttf']
  },
  'DejaVu Serif': {
    regular: ['DejaVuSerif.ttf'],
    bold: ['DejaVuSerif-Bold.ttf'],
    italic: ['DejaVuSerif-Italic.ttf'],
    boldItalic: ['DejaVuSerif-BoldItalic.ttf']
  },
  'DejaVu Mono': {
    regular: ['DejaVuSansMono.ttf'],
    bold: ['DejaVuSansMono-Bold.ttf'],
    italic: ['DejaVuSansMono-Oblique.ttf'],
    boldItalic: ['DejaVuSansMono-BoldOblique.ttf']
  },
  'Liberation Sans': {
    regular: ['LiberationSans-Regular.ttf'],
    bold: ['LiberationSans-Bold.ttf'],
    italic: ['LiberationSans-Italic.ttf'],
    boldItalic: ['LiberationSans-BoldItalic.ttf']
  },
  'Liberation Serif': {
    regular: ['LiberationSerif-Regular.ttf'],
    bold: ['LiberationSerif-Bold.ttf'],
    italic: ['LiberationSerif-Italic.ttf'],
    boldItalic: ['LiberationSerif-BoldItalic.ttf']
  },
  'Liberation Mono': {
    regular: ['LiberationMono-Regular.ttf'],
    bold: ['LiberationMono-Bold.ttf'],
    italic: ['LiberationMono-Italic.ttf'],
    boldItalic: ['LiberationMono-BoldItalic.ttf']
  }
};

const FONT_DIRS = [
  '/usr/share/fonts/truetype/dejavu',
  '/usr/share/fonts/truetype/liberation',
  '/usr/share/fonts/truetype/liberation2',
  '/usr/local/share/fonts',
  path.resolve(process.cwd(), 'fonts')
];

const STANDARD = {
  Helvetica: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique
  },
  Times: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic
  },
  Courier: {
    regular: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    boldItalic: StandardFonts.CourierBoldOblique
  },
  // CSS-only browser fonts → closest standard for PDF export
  Georgia: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic
  },
  Verdana: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique
  },
  'Trebuchet MS': {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique
  },
  Palatino: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic
  },
  Impact: {
    regular: StandardFonts.HelveticaBold,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaBoldOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique
  }
};

function styleKey(bold, italic) {
  if (bold && italic) return 'boldItalic';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'regular';
}

async function findTtf(fileNames) {
  for (const dir of FONT_DIRS) {
    for (const name of fileNames) {
      const full = path.join(dir, name);
      try {
        await fs.access(full);
        return full;
      } catch {
        // try next
      }
    }
  }
  return null;
}

/**
 * Absolute TTF path for family/style (DejaVu fallback for Unicode / StandardFonts).
 * Used when rasterizing text watermarks to PNG.
 */
export async function resolveWatermarkFontFile({
  fontFamily,
  bold = false,
  italic = false,
  text = ''
}) {
  let family = fontFamily || 'Helvetica';
  let isBold = !!bold;
  let isItalic = !!italic;

  if (family.endsWith('-Bold')) {
    isBold = true;
    family = family.replace(/-Bold$/, '');
  }

  const key = styleKey(isBold, isItalic);
  const unicode = needsUnicodeFont(text);

  if (unicode && !TTF_MAP[family]) {
    family = 'DejaVu Sans';
  }

  if (TTF_MAP[family]) {
    const file = await findTtf(TTF_MAP[family][key] || TTF_MAP[family].regular);
    if (file) return file;
  }

  // StandardFonts / CSS-only → closest installed TTF for rasterization
  const fallbackFamily = unicode ? 'DejaVu Sans' : 'Liberation Sans';
  const map = TTF_MAP[fallbackFamily] || TTF_MAP['DejaVu Sans'];
  if (!map) return null;
  return findTtf(map[key] || map.regular);
}

/** WinAnsi (StandardFonts) cannot encode Cyrillic / most Unicode. */
export function needsUnicodeFont(text = '') {
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code > 255) return true;
  }
  return false;
}

async function embedTtfFamily(pdf, family, key) {
  const ttfSpec = TTF_MAP[family];
  if (!ttfSpec) return null;
  const file = await findTtf(ttfSpec[key] || ttfSpec.regular);
  if (!file) return null;
  ensureFontkit(pdf);
  const bytes = await fs.readFile(file);
  return pdf.embedFont(bytes);
}

/**
 * Embed font for watermark text. Prefer TTF for DejaVu/Liberation; else StandardFonts.
 * Falls back to DejaVu Sans when text needs Unicode (e.g. Cyrillic).
 */
export async function resolveWatermarkFont(pdf, { fontFamily, bold, italic, text = '' }) {
  let family = fontFamily || 'Helvetica';
  let isBold = !!bold;
  let isItalic = !!italic;

  // legacy names
  if (family.endsWith('-Bold')) {
    isBold = true;
    family = family.replace(/-Bold$/, '');
  }

  const key = styleKey(isBold, isItalic);
  const unicode = needsUnicodeFont(text);

  if (unicode && !TTF_MAP[family]) {
    family = 'DejaVu Sans';
  }

  const embedded = await embedTtfFamily(pdf, family, key);
  if (embedded) return embedded;

  if (unicode) {
    const fallback = await embedTtfFamily(pdf, 'DejaVu Sans', key);
    if (fallback) return fallback;
  }

  const std = STANDARD[family] || STANDARD.Helvetica;
  return pdf.embedFont(std[key] || std.regular);
}

/** Embed a Unicode-capable TTF for document text conversion (txt/md/…). */
export async function resolveDocumentFont(pdf, { bold = false, italic = false } = {}) {
  const key = styleKey(bold, italic);
  const embedded = await embedTtfFamily(pdf, 'DejaVu Sans', key);
  if (embedded) return embedded;
  return pdf.embedFont(StandardFonts.Helvetica);
}
