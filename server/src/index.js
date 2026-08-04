import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { jobsRouter } from './routes/jobs.js';
import { previewRouter } from './routes/preview.js';
import { createPreviewStore } from './services/previews.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const resultsDir = path.join(dataDir, 'results');
const previewsDir = path.join(dataDir, 'previews');

for (const dir of [dataDir, uploadsDir, resultsDir, previewsDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const previewStore = createPreviewStore(previewsDir);

const app = express();
const PORT = Number(process.env.PORT || 3080);
const CLIENT_DIST = process.env.CLIENT_DIST || path.resolve(rootDir, '../client/dist');

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/preview', previewRouter({ previewsDir, previewStore }));
app.use('/api/jobs', jobsRouter({ uploadsDir, resultsDir, previewStore }));

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

app.listen(PORT, () => {
  console.log(`pdf-compiler server on http://localhost:${PORT}`);
});
