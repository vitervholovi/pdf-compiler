/**
 * Normalize PDFs that use encryption / permission restrictions so pdf-lib can
 * safely load and save them. Tries qpdf decrypt, then Ghostscript print-to-PDF.
 */
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

/** True if PDF trailer/catalog references encryption (permissions or password). */
export function looksEncrypted(bytes) {
  if (!bytes || bytes.length < 8) return false;
  const sample = Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Prefer latin1 so binary /O /U strings do not break the search.
  const text = sample.toString('latin1');
  return /\/Encrypt[\s/]/.test(text) || /\/Encrypt\s+\d+\s+\d+\s+R/.test(text);
}

function defaultRun(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = opts.timeoutMs
      ? setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`${cmd} timed out after ${opts.timeoutMs}ms`));
      }, opts.timeoutMs)
      : null;
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} failed (${code}): ${(stderr || stdout || '').slice(0, 500)}`));
    });
  });
}

async function assertLoadable(pdfPath) {
  const bytes = await fs.readFile(pdfPath);
  if (looksEncrypted(bytes)) {
    throw new Error('output still encrypted');
  }
  await PDFDocument.load(bytes);
}

async function tryQpdf(run, inputPath, outputPath, timeoutMs) {
  await run(
    'qpdf',
    ['--decrypt', '--password=', inputPath, outputPath],
    { timeoutMs }
  );
  await assertLoadable(outputPath);
}

async function tryGhostscript(run, inputPath, outputPath, timeoutMs) {
  await run(
    'gs',
    [
      '-dSAFER',
      '-dBATCH',
      '-dNOPAUSE',
      '-sDEVICE=pdfwrite',
      '-sPDFPassword=',
      `-sOutputFile=${outputPath}`,
      inputPath
    ],
    { timeoutMs }
  );
  await assertLoadable(outputPath);
}

/**
 * If the PDF is encrypted, write a decrypted / rewritten copy to outputPath.
 * Unencrypted inputs are copied to outputPath when paths differ; same path = no-op.
 *
 * @param {string} inputPath
 * @param {string} [outputPath] defaults to inputPath (in-place replace via temp)
 * @param {{ run?: Function, timeoutMs?: number }} [options]
 * @returns {Promise<{ method: 'none' | 'qpdf' | 'ghostscript', path: string }>}
 */
export async function normalizePdf(inputPath, outputPath = inputPath, options = {}) {
  const run = options.run || defaultRun;
  const timeoutMs = options.timeoutMs ?? 120000;
  const bytes = await fs.readFile(inputPath);

  if (!looksEncrypted(bytes)) {
    if (path.resolve(inputPath) !== path.resolve(outputPath)) {
      await fs.copyFile(inputPath, outputPath);
    }
    return { method: 'none', path: outputPath };
  }

  const samePath = path.resolve(inputPath) === path.resolve(outputPath);
  const target = samePath
    ? path.join(
      path.dirname(outputPath),
      `.normalize-${process.pid}-${Date.now()}.pdf`
    )
    : outputPath;

  const errors = [];

  try {
    await tryQpdf(run, inputPath, target, timeoutMs);
    if (samePath) {
      await fs.rename(target, outputPath);
    }
    return { method: 'qpdf', path: outputPath };
  } catch (err) {
    errors.push(`qpdf: ${err.message}`);
    await fs.rm(target, { force: true }).catch(() => {});
  }

  try {
    await tryGhostscript(run, inputPath, target, timeoutMs);
    if (samePath) {
      await fs.rename(target, outputPath);
    }
    return { method: 'ghostscript', path: outputPath };
  } catch (err) {
    errors.push(`ghostscript: ${err.message}`);
    await fs.rm(target, { force: true }).catch(() => {});
  }

  throw new Error(
    'Захищений PDF: не вдалося зняти обмеження (порожній пароль). '
    + 'Спробуйте зберегти/надрукувати файл у PDF без захисту. '
    + `(${errors.join('; ')})`
  );
}
