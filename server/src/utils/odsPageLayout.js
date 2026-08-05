/**
 * Patch ODS styles so Calc PDF export fits all columns on page width
 * (scale-to-X=1) on A4 landscape; height paginates freely.
 */
import fs from 'fs/promises';
import { readZip, writeZip } from './zipStore.js';

const A4_LANDSCAPE = {
  width: '29.7cm',
  height: '21cm',
  orientation: 'landscape'
};

function patchPageLayoutProperties(attrs) {
  let a = String(attrs)
    .replace(/\sstyle:scale-to(?:-X|-Y)?="[^"]*"/g, '')
    .replace(/\sfo:page-width="[^"]*"/g, '')
    .replace(/\sfo:page-height="[^"]*"/g, '')
    .replace(/\sstyle:print-orientation="[^"]*"/g, '');
  return (
    `<style:page-layout-properties` +
    ` fo:page-width="${A4_LANDSCAPE.width}"` +
    ` fo:page-height="${A4_LANDSCAPE.height}"` +
    ` style:print-orientation="${A4_LANDSCAPE.orientation}"` +
    ` style:scale-to-X="1"` +
    `${a}/>`
  );
}

/**
 * @param {string} odsPath
 * @returns {Promise<{ patched: boolean }>}
 */
export async function patchOdsPageLayoutForFitWidth(odsPath) {
  const buf = await fs.readFile(odsPath);
  let entries;
  try {
    entries = readZip(buf);
  } catch {
    return { patched: false };
  }

  const styles = entries.get('styles.xml')?.toString('utf8');
  if (!styles) return { patched: false };

  let count = 0;
  const patched = styles.replace(
    /<style:page-layout-properties\b([^>]*)\/>/g,
    (_full, attrs) => {
      count += 1;
      return patchPageLayoutProperties(attrs);
    }
  );

  if (!count || patched === styles) return { patched: false };

  entries.set('styles.xml', Buffer.from(patched, 'utf8'));
  await fs.writeFile(odsPath, writeZip(entries));
  return { patched: true };
}

export { patchPageLayoutProperties };
