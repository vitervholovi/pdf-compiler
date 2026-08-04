import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export function previewRouter({ previewsDir, previewStore }) {
  const router = Router();

  const storage = multer.diskStorage({
    destination(_req, _file, cb) {
      const dir = path.join(previewsDir, '_incoming', uuidv4());
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      const safe = file.originalname.replace(/[^\w.\-() \u0400-\u04FF]+/g, '_');
      cb(null, safe);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024, files: 1 }
  });

  router.post('/', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Файл обовʼязковий' });
      }
      console.log(`[preview] start ${req.file.originalname} (${req.file.size} bytes)`);
      const result = await previewStore.createQuickPreview(
        req.file.path,
        req.file.originalname
      );
      console.log(`[preview] done ${req.file.originalname} -> ${result.previewId}`);
      // cleanup incoming upload
      fs.rmSync(path.dirname(req.file.path), { recursive: true, force: true });
      res.status(201).json(result);
    } catch (err) {
      console.error('[preview] failed', err);
      if (req.file?.path) {
        fs.rmSync(path.dirname(req.file.path), { recursive: true, force: true });
      }
      res.status(500).json({ error: err.message || 'Preview conversion failed' });
    }
  });

  router.get('/:id/file', (req, res) => {
    const meta = previewStore.getPreview(req.params.id);
    if (!meta) return res.status(404).json({ error: 'Preview not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(meta.path);
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      await previewStore.removePreview(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
