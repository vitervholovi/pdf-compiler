/**
 * Trim Calc workbooks (xlsx) to Print_Area / dense used range and
 * inject fit-to-width page setup + row breaks before LibreOffice export.
 */
import fs from 'fs/promises';
import path from 'path';
import { readZip, writeZip } from './zipStore.js';

const COL_RE = /^([A-Z]+)(\d+)$/i;

export function colToIndex(col) {
  let n = 0;
  const s = String(col).toUpperCase();
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
}

export function indexToCol(n) {
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export function parseA1(ref) {
  const m = String(ref).trim().match(COL_RE);
  if (!m) return null;
  return { col: colToIndex(m[1]), row: Number(m[2]) };
}

/** "A1:I162" or sheet-qualified "$A$1:$I$162" → { minCol, minRow, maxCol, maxRow } */
export function parseRangeRef(ref) {
  const cleaned = String(ref)
    .replace(/^[^!]*!/, '')
    .replace(/\$/g, '')
    .trim();
  const parts = cleaned.split(':');
  const a = parseA1(parts[0]);
  const b = parseA1(parts[1] || parts[0]);
  if (!a || !b) return null;
  return {
    minCol: Math.min(a.col, b.col),
    minRow: Math.min(a.row, b.row),
    maxCol: Math.max(a.col, b.col),
    maxRow: Math.max(a.row, b.row)
  };
}

function inRange(col, row, range) {
  return (
    col >= range.minCol &&
    col <= range.maxCol &&
    row >= range.minRow &&
    row <= range.maxRow
  );
}

/** Collect Print_Area per localSheetId from workbook.xml */
export function parsePrintAreas(workbookXml) {
  const map = new Map();
  const re =
    /<definedName[^>]*name="_xlnm\.Print_Area"[^>]*(?:localSheetId="(\d+)")?[^>]*>([^<]*)<\/definedName>/gi;
  let m;
  while ((m = re.exec(workbookXml))) {
    const sid = m[1] != null ? Number(m[1]) : 0;
    const range = parseRangeRef(m[2]);
    if (range) map.set(sid, range);
  }
  return map;
}

/**
 * Sheet list from workbook.xml + rels target map.
 * @returns {{ sheets: { name, sheetId, rId, hidden, path }[], printAreas: Map<number, object> }}
 */
export function parseWorkbookSheets(workbookXml, relsXml) {
  const ridToTarget = new Map();
  const relRe = /<Relationship\b[^>]*>/gi;
  let rm;
  while ((rm = relRe.exec(relsXml))) {
    const tag = rm[0];
    const id = /Id="(rId\d+)"/i.exec(tag)?.[1];
    const target = /Target="([^"]+)"/i.exec(tag)?.[1];
    if (!id || !target) continue;
    const cleaned = target.replace(/^\//, '').replace(/^\.\//, '');
    const path = cleaned.startsWith('xl/')
      ? cleaned
      : cleaned.startsWith('worksheets/')
        ? `xl/${cleaned}`
        : `xl/${cleaned}`;
    ridToTarget.set(id, path);
  }

  const sheets = [];
  const sheetRe = /<sheet\b([^>]*)\/?>/gi;
  let sm;
  let index = 0;
  while ((sm = sheetRe.exec(workbookXml))) {
    const attrs = sm[1];
    const name = /name="([^"]*)"/.exec(attrs)?.[1] ?? `Sheet${index + 1}`;
    const sheetId = Number(/sheetId="(\d+)"/.exec(attrs)?.[1] || index + 1);
    const rId = /r:id="(rId\d+)"/i.exec(attrs)?.[1];
    const hidden = /state="hidden"|state="veryHidden"/i.test(attrs);
    const path = rId ? ridToTarget.get(rId) : null;
    sheets.push({ name, sheetId, rId, hidden, path, localIndex: index });
    index += 1;
  }

  return { sheets, printAreas: parsePrintAreas(workbookXml) };
}

/**
 * Bounding box of cells that have a value (<v> or <is>).
 * Falls back to all <c r="..."> if none valued.
 */
export function detectUsedRange(sheetXml) {
  const valued = [];
  const all = [];
  const cellRe = /<c\s+r="([A-Z]+)(\d+)"[^>]*\/?>|<c\s+r="([A-Z]+)(\d+)"[^>]*>/gi;
  let m;
  while ((m = cellRe.exec(sheetXml))) {
    const colLetters = m[1] || m[3];
    const row = Number(m[2] || m[4]);
    const col = colToIndex(colLetters);
    all.push({ col, row, index: m.index });
  }

  // Valued: look for cells whose XML chunk contains <v> or <is>
  const valuedRe =
    /<c\s+r="([A-Z]+)(\d+)"[^>]*>(?:(?!<\/c>).)*(?:<v[\s>]|<is[\s>])/gi;
  let vm;
  while ((vm = valuedRe.exec(sheetXml))) {
    valued.push({ col: colToIndex(vm[1]), row: Number(vm[2]) });
  }

  const pts = valued.length ? valued : all;
  if (!pts.length) return { minCol: 1, minRow: 1, maxCol: 1, maxRow: 1 };

  let minCol = Infinity;
  let minRow = Infinity;
  let maxCol = 0;
  let maxRow = 0;
  for (const p of pts) {
    minCol = Math.min(minCol, p.col);
    minRow = Math.min(minRow, p.row);
    maxCol = Math.max(maxCol, p.col);
    maxRow = Math.max(maxRow, p.row);
  }

  // Drop sparse tail: if maxCol is huge but dense block ends earlier
  return densifyRange(pts, { minCol, minRow, maxCol, maxRow });
}

/** If columns jump by >15 after a dense prefix, clip to the dense prefix. */
export function densifyRange(pts, range) {
  const colSet = [...new Set(pts.map((p) => p.col))].sort((a, b) => a - b);
  if (colSet.length < 2) return range;
  let cut = colSet[colSet.length - 1];
  for (let i = 1; i < colSet.length; i++) {
    if (colSet[i] - colSet[i - 1] > 15) {
      cut = colSet[i - 1];
      break;
    }
  }
  const filtered = pts.filter((p) => p.col <= cut);
  let minCol = Infinity;
  let minRow = Infinity;
  let maxCol = 0;
  let maxRow = 0;
  for (const p of filtered) {
    minCol = Math.min(minCol, p.col);
    minRow = Math.min(minRow, p.row);
    maxCol = Math.max(maxCol, p.col);
    maxRow = Math.max(maxRow, p.row);
  }
  return { minCol, minRow, maxCol, maxRow };
}

function mergeOverlapsRange(ref, range) {
  const parsed = parseRangeRef(ref);
  if (!parsed) return false;
  // Keep merge only if it intersects the keep-range and stays within expanded bounds
  return (
    parsed.maxCol >= range.minCol &&
    parsed.minCol <= range.maxCol &&
    parsed.maxRow >= range.minRow &&
    parsed.minRow <= range.maxRow &&
    parsed.minCol >= range.minCol &&
    parsed.maxCol <= range.maxCol &&
    parsed.minRow >= range.minRow &&
    parsed.maxRow <= range.maxRow
  );
}

/**
 * Remove cells/merges outside range; rewrite dimension.
 * @returns {string}
 */
/**
 * Drop one <c> element. Opening tags that end with /> must not be treated as
 * body cells — [^>]*> also matches ".../>", which used to swallow following
 * out-of-range cells (e.g. I34/> + DA34) and leave XFD-width junk in the sheet.
 */
function replaceCellsOutsideRange(xml, range) {
  return String(xml).replace(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/gi, (full) => {
    const m = /\br="([A-Z]+)(\d+)"/i.exec(full);
    if (!m) return full;
    return inRange(colToIndex(m[1]), Number(m[2]), range) ? full : '';
  });
}

export function trimSheetXml(sheetXml, range) {
  let xml = replaceCellsOutsideRange(sheetXml, range);

  // Filter mergeCell
  xml = xml.replace(
    /<mergeCells([^>]*)>([\s\S]*?)<\/mergeCells>/i,
    (full, attrs, body) => {
      const kept = [];
      const re = /<mergeCell\b[^>]*\bref="([^"]+)"[^>]*\/>/gi;
      let m;
      while ((m = re.exec(body))) {
        if (mergeOverlapsRange(m[1], range)) kept.push(m[0]);
      }
      if (!kept.length) return '';
      return `<mergeCells count="${kept.length}">${kept.join('')}</mergeCells>`;
    }
  );

  const dim = `${indexToCol(range.minCol)}${range.minRow}:${indexToCol(range.maxCol)}${range.maxRow}`;
  if (/<dimension\b[^>]*\/>/i.test(xml)) {
    xml = xml.replace(/<dimension\b[^>]*\/>/i, `<dimension ref="${dim}"/>`);
  } else if (/<dimension\b[^>]*>/i.test(xml)) {
    xml = xml.replace(/<dimension\b[^>]*>/i, `<dimension ref="${dim}">`);
  } else {
    xml = xml.replace(/(<worksheet[^>]*>)/i, `$1<dimension ref="${dim}"/>`);
  }

  // Clamp <col max="..."> that extend past keep range
  xml = xml.replace(/<col\b([^>]*)\/?>/gi, (full, attrs) => {
    const min = Number(/min="(\d+)"/.exec(attrs)?.[1] || 1);
    const max = Number(/max="(\d+)"/.exec(attrs)?.[1] || min);
    if (min > range.maxCol || max < range.minCol) return '';
    const newMax = Math.min(max, range.maxCol);
    const newMin = Math.max(min, range.minCol);
    let next = full.replace(/min="\d+"/, `min="${newMin}"`).replace(/max="\d+"/, `max="${newMax}"`);
    return next;
  });

  // Excel often leaves spans="1:16384" — LO treats that as full-width used area
  const span = `${range.minCol}:${range.maxCol}`;
  xml = xml.replace(/\bspans="[^"]*"/gi, `spans="${span}"`);

  return xml;
}

/**
 * Drop hidden sheets from workbook.xml / rels; return paths to delete from zip.
 */
export function stripHiddenSheets(workbookXml, relsXml, sheets) {
  const hidden = sheets.filter((s) => s.hidden);
  if (!hidden.length) {
    return { workbookXml, relsXml, removePaths: [] };
  }

  let xml = workbookXml;
  let rels = relsXml;
  const hiddenNames = new Set(hidden.map((s) => s.name));
  const hiddenIndexes = new Set(hidden.map((s) => s.localIndex));

  for (const s of hidden) {
    xml = xml.replace(
      new RegExp(`<sheet\\b[^>]*name="${escapeRegex(s.name)}"[^>]*\\/?>`, 'i'),
      ''
    );
    if (s.rId) {
      rels = rels.replace(
        new RegExp(`<Relationship\\b[^>]*Id="${escapeRegex(s.rId)}"[^>]*\\/?>`, 'i'),
        ''
      );
    }
  }

  // LibreOffice refuses workbooks with definedNames pointing at removed sheets
  xml = xml.replace(/<definedName\b[^>]*>[\s\S]*?<\/definedName>/gi, (full) => {
    const sid = /localSheetId="(\d+)"/i.exec(full);
    if (sid && hiddenIndexes.has(Number(sid[1]))) return '';
    for (const name of hiddenNames) {
      if (full.includes(`${name}!`) || full.includes(`'${name}'!`)) return '';
    }
    return full;
  });

  const removePaths = [];
  for (const s of hidden) {
    if (!s.path) continue;
    removePaths.push(s.path);
    const base = path.basename(s.path);
    removePaths.push(`xl/worksheets/_rels/${base}.rels`);
  }
  return { workbookXml: xml, relsXml: rels, removePaths };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Prefer landscape when exporting Calc sheets. */
export function suggestPrintOrientation(_range) {
  return 'landscape';
}

export function unionRanges(a, b) {
  return {
    minCol: Math.min(a.minCol, b.minCol),
    minRow: Math.min(a.minRow, b.minRow),
    maxCol: Math.max(a.maxCol, b.maxCol),
    maxRow: Math.max(a.maxRow, b.maxRow)
  };
}

/**
 * Keep all real tables: union Print_Area with detected used range,
 * but ignore insane Print_Area (XFD) and ignore used-range that stretches
 * far past a sane Print_Area (styled empty cells).
 */
export function pickSheetRange(printRange, used) {
  if (!printRange) return used;

  const printCols = printRange.maxCol - printRange.minCol + 1;
  const printTooWide = printRange.maxCol > 256 || printCols > 80;
  const printTooTall = printRange.maxRow > used.maxRow + 500;
  if (printTooWide || printTooTall) return used;

  // Styled empty cells often sit far right of Print_Area — don't expand width past it
  const usedTooWide = used.maxCol > printRange.maxCol + 5;
  if (usedTooWide) {
    return {
      minCol: Math.min(printRange.minCol, used.minCol),
      maxCol: printRange.maxCol,
      minRow: Math.min(printRange.minRow, used.minRow),
      maxRow: Math.max(printRange.maxRow, used.maxRow)
    };
  }

  return unionRanges(printRange, used);
}

/**
 * Landscape A4: fit all columns on one page width (no horizontal split);
 * tall content continues on following pages (fitToHeight unlimited).
 */
export function applySheetPrintLayout(sheetXml, range, opts = {}) {
  const orientation = opts.orientation || suggestPrintOrientation(range);
  let xml = String(sheetXml);

  // Enable fit-to-page so fitToWidth/fitToHeight apply
  if (/<sheetPr\b[^>]*\/>/i.test(xml)) {
    xml = xml.replace(/<sheetPr\b([^>]*)\/>/i, (_m, attrs) => {
      const cleaned = String(attrs).replace(/\s*\/\s*$/, '');
      return `<sheetPr${cleaned}><pageSetUpPr fitToPage="1"/></sheetPr>`;
    });
  } else if (/<sheetPr\b[^>]*>/i.test(xml)) {
    if (/<pageSetUpPr\b/i.test(xml)) {
      xml = xml.replace(
        /<pageSetUpPr\b[^>]*\/?>/i,
        '<pageSetUpPr fitToPage="1"/>'
      );
    } else {
      xml = xml.replace(/(<sheetPr\b[^>]*>)/i, '$1<pageSetUpPr fitToPage="1"/>');
    }
  } else {
    xml = xml.replace(
      /(<worksheet\b[^>]*>)/i,
      '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
    );
  }

  // One very wide column forces scale-to-X to shrink the entire sheet
  xml = capColumnWidths(xml, opts.maxColWidth ?? 28);

  xml = xml.replace(/<pageMargins\b[^>]*\/>/gi, '');
  xml = xml.replace(/<pageMargins\b[^>]*>[\s\S]*?<\/pageMargins>/gi, '');
  const margins =
    '<pageMargins left="0.4" right="0.4" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>';

  xml = xml.replace(/<printOptions\b[^>]*\/>/gi, '');
  xml = xml.replace(/<printOptions\b[^>]*>[\s\S]*?<\/printOptions>/gi, '');
  const printOptions =
    '<printOptions horizontalCentered="1" verticalCentered="0" headings="0" gridLines="0"/>';

  // 1 page wide × N pages tall — keeps the table together horizontally
  xml = xml.replace(/<pageSetup\b[^>]*\/>/gi, '');
  xml = xml.replace(/<pageSetup\b[^>]*>[\s\S]*?<\/pageSetup>/gi, '');
  const pageSetup = `<pageSetup paperSize="9" orientation="${orientation}" fitToWidth="1" fitToHeight="0"/>`;

  // Drop manual breaks (esp. col breaks = horizontal splits)
  xml = xml.replace(/<rowBreaks\b[^>]*\/>/gi, '');
  xml = xml.replace(/<rowBreaks\b[^>]*>[\s\S]*?<\/rowBreaks>/gi, '');
  xml = xml.replace(/<colBreaks\b[^>]*\/>/gi, '');
  xml = xml.replace(/<colBreaks\b[^>]*>[\s\S]*?<\/colBreaks>/gi, '');

  const insert = `${margins}${printOptions}${pageSetup}`;
  if (/<\/worksheet>/i.test(xml)) {
    xml = xml.replace(/<\/worksheet>/i, `${insert}</worksheet>`);
  } else {
    xml += insert;
  }

  return xml;
}

/** Clamp col width="…" so one fat column does not dominate fit-to-width scale. */
export function capColumnWidths(sheetXml, maxWidth = 28) {
  return String(sheetXml).replace(/<col\b([^>]*)\/?>/gi, (full, attrs) => {
    const m = /\bwidth="([0-9.]+)"/i.exec(attrs);
    if (!m) return full;
    const w = Number(m[1]);
    if (!Number.isFinite(w) || w <= maxWidth) return full;
    return full.replace(/\bwidth="[0-9.]+"/i, `width="${maxWidth}"`);
  });
}

/**
 * Ensure each visible sheet has a Print_Area definedName matching its keep-range.
 */
export function upsertPrintAreas(workbookXml, sheetRanges) {
  let xml = String(workbookXml);
  // Drop existing Print_Area names — we rewrite them
  xml = xml.replace(
    /<definedName\b[^>]*name="_xlnm\.Print_Area"[^>]*>[\s\S]*?<\/definedName>/gi,
    ''
  );

  const names = sheetRanges
    .map(({ localIndex, name, range }) => {
      const ref = `${indexToCol(range.minCol)}${range.minRow}:${indexToCol(range.maxCol)}${range.maxRow}`;
      const sheetRef = /[^\w.]/.test(name) ? `'${name.replace(/'/g, "''")}'` : name;
      return `<definedName name="_xlnm.Print_Area" localSheetId="${localIndex}">${sheetRef}!${ref}</definedName>`;
    })
    .join('');

  if (!names) return xml;

  if (/<definedNames\b[^>]*>/i.test(xml)) {
    xml = xml.replace(/(<definedNames\b[^>]*>)/i, `$1${names}`);
    // Remove empty wrapper leftovers if body became only whitespace — keep as-is
  } else if (/<definedNames\b[^>]*\/>/i.test(xml)) {
    xml = xml.replace(/<definedNames\b[^>]*\/>/i, `<definedNames>${names}</definedNames>`);
  } else {
    xml = xml.replace(/(<\/workbook>)/i, `<definedNames>${names}</definedNames>$1`);
  }
  return xml;
}

/**
 * Prepare an xlsx file for Calc PDF export with print layout + page breaks.
 * @param {string} inputPath
 * @param {string} outputPath
 * @returns {Promise<{ trimmed: boolean, sheets: number }>}
 */
export async function prepareCalcXlsx(inputPath, outputPath) {
  const buf = await fs.readFile(inputPath);
  let entries;
  try {
    entries = readZip(buf);
  } catch {
    await fs.copyFile(inputPath, outputPath);
    return { trimmed: false, sheets: 0 };
  }

  const workbookXml = entries.get('xl/workbook.xml')?.toString('utf8');
  const relsXml = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8');
  if (!workbookXml || !relsXml) {
    await fs.copyFile(inputPath, outputPath);
    return { trimmed: false, sheets: 0 };
  }

  const { sheets, printAreas } = parseWorkbookSheets(workbookXml, relsXml);
  const { workbookXml: wbStripped, relsXml: relsOut, removePaths } = stripHiddenSheets(
    workbookXml,
    relsXml,
    sheets
  );
  let wbOut = wbStripped;
  entries.set('xl/_rels/workbook.xml.rels', Buffer.from(relsOut, 'utf8'));

  for (const p of removePaths) {
    entries.delete(p);
  }

  if (removePaths.length && entries.has('[Content_Types].xml')) {
    let ct = entries.get('[Content_Types].xml').toString('utf8');
    for (const p of removePaths) {
      if (!p.endsWith('.xml')) continue;
      const part = `/${p}`;
      ct = ct.replace(
        new RegExp(
          `<Override\\s+PartName="${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^/]*/>`,
          'gi'
        ),
        ''
      );
    }
    entries.set('[Content_Types].xml', Buffer.from(ct, 'utf8'));
  }

  const visible = sheets.filter((s) => !s.hidden);
  let trimmedAny = removePaths.length > 0;
  const sheetRanges = [];

  visible.forEach((sheet, newIndex) => {
    if (!sheet.path || !entries.has(sheet.path)) return;
    const xml = entries.get(sheet.path).toString('utf8');
    const printRange = printAreas.get(sheet.localIndex);
    const used = detectUsedRange(xml);
    const range = pickSheetRange(printRange, used);
    let next = trimSheetXml(xml, range);
    next = applySheetPrintLayout(next, range, { orientation: 'landscape' });
    if (next !== xml) trimmedAny = true;
    entries.set(sheet.path, Buffer.from(next, 'utf8'));
    // localSheetId must match post-strip sheet order (0..n-1)
    sheetRanges.push({ localIndex: newIndex, name: sheet.name, range });
  });

  wbOut = upsertPrintAreas(wbOut, sheetRanges);
  entries.set('xl/workbook.xml', Buffer.from(wbOut, 'utf8'));

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, writeZip(entries));
  return { trimmed: trimmedAny, sheets: visible.length };
}

/**
 * If input is .xlsx, write a trimmed copy to outPath and return outPath.
 * Otherwise return inputPath unchanged.
 */
export async function maybePrepareCalcFile(inputPath, outPath) {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext !== '.xlsx') return inputPath;
  await prepareCalcXlsx(inputPath, outPath);
  return outPath;
}
