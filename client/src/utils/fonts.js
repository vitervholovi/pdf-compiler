/** Shared font catalog for watermark text */

export const FONT_OPTIONS = [
  { id: 'Helvetica', label: 'Helvetica', css: 'Helvetica, Arial, sans-serif', kind: 'standard' },
  { id: 'Times', label: 'Times', css: '"Times New Roman", Times, serif', kind: 'standard' },
  { id: 'Courier', label: 'Courier', css: '"Courier New", Courier, monospace', kind: 'standard' },
  { id: 'DejaVu Sans', label: 'DejaVu Sans', css: '"DejaVu Sans", "Segoe UI", sans-serif', kind: 'ttf' },
  { id: 'DejaVu Serif', label: 'DejaVu Serif', css: '"DejaVu Serif", Georgia, serif', kind: 'ttf' },
  { id: 'DejaVu Mono', label: 'DejaVu Mono', css: '"DejaVu Sans Mono", Consolas, monospace', kind: 'ttf' },
  { id: 'Liberation Sans', label: 'Liberation Sans', css: '"Liberation Sans", Arial, sans-serif', kind: 'ttf' },
  { id: 'Liberation Serif', label: 'Liberation Serif', css: '"Liberation Serif", "Times New Roman", serif', kind: 'ttf' },
  { id: 'Liberation Mono', label: 'Liberation Mono', css: '"Liberation Mono", Consolas, monospace', kind: 'ttf' },
  { id: 'Georgia', label: 'Georgia', css: 'Georgia, "Times New Roman", serif', kind: 'css-only' },
  { id: 'Verdana', label: 'Verdana', css: 'Verdana, Geneva, sans-serif', kind: 'css-only' },
  { id: 'Trebuchet MS', label: 'Trebuchet MS', css: '"Trebuchet MS", Helvetica, sans-serif', kind: 'css-only' },
  { id: 'Palatino', label: 'Palatino', css: '"Palatino Linotype", Palatino, serif', kind: 'css-only' },
  { id: 'Impact', label: 'Impact', css: 'Impact, Haettenschweiler, sans-serif', kind: 'css-only' }
];

export function fontCssFamily(fontFamily) {
  const found = FONT_OPTIONS.find((f) => f.id === fontFamily);
  return found?.css || 'Helvetica, Arial, sans-serif';
}

/** Map legacy fontFamily values that included Bold in the name */
export function normalizeTextStyle(text = {}) {
  let fontFamily = text.fontFamily || 'Helvetica';
  let bold = !!text.bold;
  let italic = !!text.italic;
  const underline = !!text.underline;

  if (fontFamily.includes('-Bold')) {
    bold = true;
    fontFamily = fontFamily.replace(/-Bold$/, '');
  }
  if (fontFamily === 'Helvetica-Bold') {
    bold = true;
    fontFamily = 'Helvetica';
  }
  if (fontFamily === 'Times-Bold') {
    bold = true;
    fontFamily = 'Times';
  }

  return { ...text, fontFamily, bold, italic, underline };
}
