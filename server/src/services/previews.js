import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { convertToPdf } from './convert.js';

const previews = new Map();
const TTL_MS = 60 * 60 * 1000;

export function createPreviewStore(previewsDir) {
  fs.mkdirSync(previewsDir, { recursive: true });

  async function purgeExpired() {
    const now = Date.now();
    for (const [id, meta] of previews) {
      if (now - meta.createdAt > TTL_MS) {
        await removePreview(id).catch(() => {});
      }
    }
  }

  setInterval(() => {
    purgeExpired().catch(() => {});
  }, 10 * 60 * 1000).unref?.();

  async function createQuickPreview(inputPath, originalName) {
    const id = uuidv4();
    const dir = path.join(previewsDir, id);
    await fsp.mkdir(dir, { recursive: true });
    const pdfPath = await convertToPdf(inputPath, dir, { quick: true });
    const finalPath = path.join(dir, 'preview.pdf');
    if (path.resolve(pdfPath) !== path.resolve(finalPath)) {
      await fsp.rename(pdfPath, finalPath).catch(async () => {
        await fsp.copyFile(pdfPath, finalPath);
        await fsp.rm(pdfPath, { force: true }).catch(() => {});
      });
    }
    previews.set(id, {
      id,
      path: finalPath,
      dir,
      originalName,
      createdAt: Date.now()
    });
    return {
      previewId: id,
      url: `/api/preview/${id}/file`
    };
  }

  function getPreview(id) {
    return previews.get(id) || null;
  }

  async function removePreview(id) {
    const meta = previews.get(id);
    if (!meta) return;
    previews.delete(id);
    await fsp.rm(meta.dir, { recursive: true, force: true }).catch(() => {});
  }

  async function removeMany(ids = []) {
    await Promise.all(ids.filter(Boolean).map((id) => removePreview(id)));
  }

  return { createQuickPreview, getPreview, removePreview, removeMany, purgeExpired };
}
