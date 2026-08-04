/**
 * Multer/busboy historically treat multipart filename bytes as Latin-1.
 * Browsers send UTF-8, so Cyrillic becomes mojibake like "Ð¨Ð°Ð±Ð»Ð¾Ð½".
 * Re-interpret the string as Latin-1 bytes → UTF-8 text.
 */
export function decodeUploadFilename(name = '') {
  if (!name) return name;
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    // Reject if decoding produced replacement chars and original looked fine
    if (decoded.includes('\uFFFD') && !name.includes('\uFFFD')) {
      return name;
    }
    return decoded;
  } catch {
    return name;
  }
}

/** Safe name for disk storage — keep letters (incl. Cyrillic), digits, common punctuation. */
export function safeFilename(name = '') {
  const decoded = decodeUploadFilename(name);
  const base = decoded.replace(/[^\w.\-() \u0400-\u04FF]+/gu, '_').replace(/_+/g, '_');
  return base || 'file';
}
