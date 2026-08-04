export const PREVIEWABLE_EXT = new Set([
  'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif'
]);

export const OFFICE_EXT = new Set([
  'doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp'
]);

export const TEXT_EXT = new Set(['txt', 'md', 'csv', 'json', 'log', 'xml', 'html', 'htm']);

export const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif']);

export const DJVU_EXT = new Set(['djvu', 'djv']);

export function extOf(filename = '') {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : '';
}

export function isPdf(filename) {
  return extOf(filename) === 'pdf';
}

export function canPreview(filename) {
  return PREVIEWABLE_EXT.has(extOf(filename));
}

export function fileCategory(filename) {
  const e = extOf(filename);
  if (e === 'pdf') return 'pdf';
  if (IMAGE_EXT.has(e)) return 'image';
  if (OFFICE_EXT.has(e)) return 'office';
  if (TEXT_EXT.has(e)) return 'text';
  if (DJVU_EXT.has(e)) return 'djvu';
  return 'other';
}
