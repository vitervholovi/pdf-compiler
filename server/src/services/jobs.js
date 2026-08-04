import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import archiver from 'archiver';
import { convertToPdf } from './convert.js';
import { applyWatermark } from './watermark.js';

const jobs = new Map();

function createJobRecord(id) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);
  return {
    id,
    status: 'queued',
    createdAt: Date.now(),
    files: [],
    events: [],
    downloadPath: null,
    error: null,
    emitter
  };
}

function emit(job, event) {
  const payload = { ...event, ts: Date.now() };
  job.events.push(payload);
  job.emitter.emit('event', payload);
}

export function getJob(id) {
  return jobs.get(id);
}

export function createJob({ id, files, options, uploadsDir, resultsDir, previewStore }) {
  const job = createJobRecord(id);
  job.files = files.map((f) => ({
    originalName: f.originalName,
    storedName: f.storedName,
    size: f.size,
    previewId: f.previewId || null
  }));
  job.options = options;
  job.uploadsDir = uploadsDir;
  job.resultsDir = resultsDir;
  job.previewStore = previewStore;
  jobs.set(id, job);

  setImmediate(() => runJob(job).catch((err) => {
    job.status = 'failed';
    job.error = err.message;
    emit(job, { type: 'failed', message: err.message });
  }));

  return job;
}

async function zipDirectory(dir, outPath) {
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(dir, false);
    archive.finalize();
  });
}

async function runJob(job) {
  const { options, uploadsDir, resultsDir, previewStore } = job;
  const watermark = options.watermark || {};
  const wmEnabled = !!(watermark.text?.enabled || watermark.image?.enabled);
  const workRoot = path.join(resultsDir, job.id);
  const outDir = path.join(workRoot, 'out');
  await fsp.mkdir(outDir, { recursive: true });

  job.status = 'running';
  emit(job, { type: 'queued', message: 'Завдання в черзі', percent: 0 });

  const total = job.files.length;
  let index = 0;
  const previewIds = [];

  for (const file of job.files) {
    index += 1;
    if (file.previewId) previewIds.push(file.previewId);
    const inputPath = path.join(uploadsDir, job.id, file.storedName);
    const base = path.parse(file.originalName).name;
    const filePercentBase = ((index - 1) / total) * 100;

    emit(job, {
      type: 'file_start',
      currentFile: file.originalName,
      index,
      total,
      step: 'start',
      percent: Math.round(filePercentBase)
    });

    try {
      emit(job, {
        type: 'converting',
        currentFile: file.originalName,
        index,
        total,
        step: 'converting',
        percent: Math.round(filePercentBase + (20 / total)),
        message: 'Повноцінна конвертація в PDF'
      });

      const convDir = path.join(workRoot, 'conv', String(index));
      await fsp.mkdir(convDir, { recursive: true });
      const workingPath = await convertToPdf(inputPath, convDir, { quick: false });

      if (wmEnabled) {
        emit(job, {
          type: 'watermarking',
          currentFile: file.originalName,
          index,
          total,
          step: 'watermarking',
          percent: Math.round(filePercentBase + (60 / total))
        });
        const imageName = options.watermarkImageStoredName;
        const imagePath = imageName
          ? path.join(uploadsDir, job.id, imageName)
          : null;
        await applyWatermark(
          workingPath,
          path.join(outDir, `${base}.pdf`),
          watermark,
          imagePath
        );
      } else {
        await fsp.copyFile(workingPath, path.join(outDir, `${base}.pdf`));
      }

      emit(job, {
        type: 'file_done',
        currentFile: file.originalName,
        index,
        total,
        step: 'done',
        percent: Math.round((index / total) * 95)
      });
    } catch (err) {
      emit(job, {
        type: 'file_error',
        currentFile: file.originalName,
        index,
        total,
        step: 'error',
        message: err.message,
        percent: Math.round((index / total) * 95)
      });
    }
  }

  emit(job, {
    type: 'zipping',
    step: 'zipping',
    percent: 97,
    message: 'Створення архіву'
  });

  const zipPath = path.join(resultsDir, `${job.id}.zip`);
  await zipDirectory(outDir, zipPath);
  job.downloadPath = zipPath;
  job.status = 'completed';

  // delete temporary quick-preview PDFs
  if (previewStore) {
    await previewStore.removeMany(previewIds);
    emit(job, {
      type: 'cleanup',
      message: 'Тимчасові preview-файли видалено',
      percent: 99
    });
  }

  emit(job, {
    type: 'completed',
    step: 'completed',
    percent: 100,
    message: 'Готово',
    downloadUrl: `/api/jobs/${job.id}/download`
  });
}
