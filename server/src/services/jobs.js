import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import archiver from 'archiver';
import { convertToPdf } from './convert.js';
import { applyWatermark } from './watermark.js';
import { isPdf } from '../utils/mime.js';

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

export function createJob({ id, files, options, uploadsDir, resultsDir }) {
  const job = createJobRecord(id);
  job.files = files.map((f) => ({
    originalName: f.originalName,
    storedName: f.storedName,
    size: f.size
  }));
  job.options = options;
  job.uploadsDir = uploadsDir;
  job.resultsDir = resultsDir;
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
  const { options, uploadsDir, resultsDir } = job;
  const convertAll = options.convertToPdf !== false;
  const watermark = options.watermark || {};
  const wmEnabled = !!(watermark.text?.enabled || watermark.image?.enabled);
  const workRoot = path.join(resultsDir, job.id);
  const outDir = path.join(workRoot, 'out');
  await fsp.mkdir(outDir, { recursive: true });

  job.status = 'running';
  emit(job, { type: 'queued', message: 'Завдання в черзі', percent: 0 });

  const total = job.files.length;
  let index = 0;

  for (const file of job.files) {
    index += 1;
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
      let workingPath = inputPath;
      let isWorkingPdf = isPdf(file.originalName);

      if (convertAll && !isWorkingPdf) {
        emit(job, {
          type: 'converting',
          currentFile: file.originalName,
          index,
          total,
          step: 'converting',
          percent: Math.round(filePercentBase + (20 / total))
        });
        const convDir = path.join(workRoot, 'conv', String(index));
        await fsp.mkdir(convDir, { recursive: true });
        workingPath = await convertToPdf(inputPath, convDir);
        isWorkingPdf = true;
      } else if (convertAll && isWorkingPdf) {
        const dest = path.join(workRoot, 'conv', String(index), `${base}.pdf`);
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.copyFile(inputPath, dest);
        workingPath = dest;
      }

      if (wmEnabled && isWorkingPdf) {
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
        const outName = convertAll || isPdf(file.originalName)
          ? `${base}.pdf`
          : `${base}.pdf`;
        await applyWatermark(workingPath, path.join(outDir, outName), watermark, imagePath);
      } else if (wmEnabled && !isWorkingPdf) {
        emit(job, {
          type: 'warning',
          code: 'watermark_skipped_not_pdf',
          currentFile: file.originalName,
          index,
          total,
          message: 'Watermark пропущено: файл не PDF і конвертацію вимкнено'
        });
        await fsp.copyFile(inputPath, path.join(outDir, file.originalName));
      } else if (convertAll || isWorkingPdf) {
        const outName = isWorkingPdf ? `${base}.pdf` : file.originalName;
        await fsp.copyFile(workingPath, path.join(outDir, outName));
      } else {
        await fsp.copyFile(inputPath, path.join(outDir, file.originalName));
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

  emit(job, {
    type: 'completed',
    step: 'completed',
    percent: 100,
    message: 'Готово',
    downloadUrl: `/api/jobs/${job.id}/download`
  });
}
