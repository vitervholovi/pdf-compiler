import fs from 'fs/promises';
import path from 'path';
import { StandardFonts } from 'pdf-lib';

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
 * Embed font for watermark text. Prefer TTF for DejaVu/Liberation; else StandardFonts.
 */
export async function resolveWatermarkFont(pdf, { fontFamily, bold, italic }) {
  let family = fontFamily || 'Helvetica';
  let isBold = !!bold;
  let isItalic = !!italic;

  // legacy names
  if (family.endsWith('-Bold')) {
    isBold = true;
    family = family.replace(/-Bold$/, '');
  }

  const key = styleKey(isBold, isItalic);
  const ttfSpec = TTF_MAP[family];
  if (ttfSpec) {
    const file = await findTtf(ttfSpec[key] || ttfSpec.regular);
    if (file) {
      const bytes = await fs.readFile(file);
      return pdf.embedFont(bytes);
    }
  }

  const std = STANDARD[family] || STANDARD.Helvetica;
  return pdf.embedFont(std[key] || std.regular);
}
