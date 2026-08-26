import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { looksEncrypted, normalizePdf } from './normalizePdf.js';

async function makePlainPdf(filePath) {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  await fs.writeFile(filePath, await doc.save());
}

test('looksEncrypted detects /Encrypt ref', () => {
  const plain = Buffer.from('%PDF-1.4\ntrailer\n<< /Size 1 /Root 1 0 R >>\n');
  assert.equal(looksEncrypted(plain), false);
  const enc = Buffer.from(
    '%PDF-1.4\ntrailer\n<< /Encrypt 37 0 R /Root 2 0 R >>\n'
  );
  assert.equal(looksEncrypted(enc), true);
});

test('normalizePdf no-op for unencrypted (same path)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'norm-pdf-'));
  const pdf = path.join(dir, 'plain.pdf');
  await makePlainPdf(pdf);
  const before = await fs.readFile(pdf);
  const result = await normalizePdf(pdf);
  assert.equal(result.method, 'none');
  assert.deepEqual(await fs.readFile(pdf), before);
  await fs.rm(dir, { recursive: true, force: true });
});

test('normalizePdf copies unencrypted when paths differ', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'norm-pdf-'));
  const src = path.join(dir, 'plain.pdf');
  const dst = path.join(dir, 'out.pdf');
  await makePlainPdf(src);
  const result = await normalizePdf(src, dst);
  assert.equal(result.method, 'none');
  assert.equal(result.path, dst);
  await PDFDocument.load(await fs.readFile(dst));
  await fs.rm(dir, { recursive: true, force: true });
});

test('normalizePdf tries qpdf then ghostscript when encrypted', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'norm-pdf-'));
  const src = path.join(dir, 'enc.pdf');
  const dst = path.join(dir, 'out.pdf');
  // Minimal fake encrypted bytes — tools are mocked.
  await fs.writeFile(
    src,
    Buffer.from('%PDF-1.4\ntrailer\n<< /Encrypt 1 0 R /Root 2 0 R >>\n%%EOF\n')
  );

  const calls = [];
  const run = async (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === 'qpdf') throw new Error('qpdf boom');
    if (cmd === 'gs') {
      const outArg = args.find((a) => a.startsWith('-sOutputFile='));
      await makePlainPdf(outArg.slice('-sOutputFile='.length));
      return { stdout: '', stderr: '' };
    }
    throw new Error(`unexpected ${cmd}`);
  };

  const result = await normalizePdf(src, dst, { run });
  assert.equal(result.method, 'ghostscript');
  assert.equal(calls[0].cmd, 'qpdf');
  assert.equal(calls[1].cmd, 'gs');
  await PDFDocument.load(await fs.readFile(dst));
  await fs.rm(dir, { recursive: true, force: true });
});

test('normalizePdf succeeds on qpdf without calling gs', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'norm-pdf-'));
  const src = path.join(dir, 'enc.pdf');
  const dst = path.join(dir, 'out.pdf');
  await fs.writeFile(
    src,
    Buffer.from('%PDF-1.4\ntrailer\n<< /Encrypt 1 0 R /Root 2 0 R >>\n%%EOF\n')
  );

  const calls = [];
  const run = async (cmd, args) => {
    calls.push(cmd);
    if (cmd === 'qpdf') {
      await makePlainPdf(args[args.length - 1]);
      return { stdout: '', stderr: '' };
    }
    throw new Error('gs should not run');
  };

  const result = await normalizePdf(src, dst, { run });
  assert.equal(result.method, 'qpdf');
  assert.deepEqual(calls, ['qpdf']);
  await fs.rm(dir, { recursive: true, force: true });
});

test('normalizePdf throws when both tools fail', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'norm-pdf-'));
  const src = path.join(dir, 'enc.pdf');
  await fs.writeFile(
    src,
    Buffer.from('%PDF-1.4\ntrailer\n<< /Encrypt 1 0 R /Root 2 0 R >>\n%%EOF\n')
  );
  const run = async () => {
    throw new Error('nope');
  };
  await assert.rejects(
    () => normalizePdf(src, path.join(dir, 'out.pdf'), { run }),
    /Захищений PDF/
  );
  await fs.rm(dir, { recursive: true, force: true });
});
