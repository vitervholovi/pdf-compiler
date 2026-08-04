import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { createJob, getJob } from '../services/jobs.js';
import { decodeUploadFilename, safeFilename } from '../utils/filenames.js';

export function jobsRouter({ uploadsDir, resultsDir, previewStore }) {
  const router = Router();

  const storage = multer.diskStorage({
    destination(req, _file, cb) {
      const jobId = req.jobId || (req.jobId = uuidv4());
      const dir = path.join(uploadsDir, jobId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      cb(null, `${Date.now()}-${safeFilename(file.originalname)}`);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024, files: 50 }
  });

  router.post('/', (req, res, next) => {
    upload.fields([
      { name: 'files', maxCount: 50 },
      { name: 'watermarkImage', maxCount: 1 }
    ])(req, res, (err) => {
      if (err) return next(err);
      try {
        const jobId = req.jobId;
        if (!jobId) {
          return res.status(400).json({ error: 'Немає файлів' });
        }
        const files = (req.files?.files || []).map((f) => ({
          originalName: decodeUploadFilename(f.originalname),
          storedName: f.filename,
          size: f.size
        }));
        if (!files.length) {
          return res.status(400).json({ error: 'Додайте хоча б один файл' });
        }

        let watermark = {};
        try {
          watermark = JSON.parse(req.body.watermark || '{}');
        } catch {
          watermark = {};
        }

        let previewIds = [];
        try {
          previewIds = JSON.parse(req.body.previewIds || '[]');
        } catch {
          previewIds = [];
        }
        files.forEach((f, i) => {
          f.previewId = previewIds[i] || null;
        });

        const wmImage = req.files?.watermarkImage?.[0];

        createJob({
          id: jobId,
          files,
          options: {
            watermark,
            watermarkImageStoredName: wmImage?.filename || null
          },
          uploadsDir,
          resultsDir,
          previewStore
        });

        res.status(201).json({ jobId });
      } catch (e) {
        next(e);
      }
    });
  });

  router.get('/:id', (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({
      id: job.id,
      status: job.status,
      error: job.error,
      events: job.events,
      downloadUrl: job.downloadPath ? `/api/jobs/${job.id}/download` : null
    });
  });

  router.get('/:id/events', (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    for (const ev of job.events) {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    }

    if (job.status === 'completed' || job.status === 'failed') {
      res.write(`data: ${JSON.stringify({ type: 'end', status: job.status })}\n\n`);
      return res.end();
    }

    const onEvent = (ev) => {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
      if (ev.type === 'completed' || ev.type === 'failed') {
        res.write(`data: ${JSON.stringify({ type: 'end', status: ev.type })}\n\n`);
        cleanup();
        res.end();
      }
    };

    const cleanup = () => {
      job.emitter.off('event', onEvent);
    };

    job.emitter.on('event', onEvent);
    req.on('close', cleanup);
  });

  router.get('/:id/download', (req, res) => {
    const job = getJob(req.params.id);
    if (!job || !job.downloadPath) {
      return res.status(404).json({ error: 'Архів ще не готовий' });
    }
    res.download(job.downloadPath, `pdf-compiler-${job.id}.zip`);
  });

  return router;
}
