import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireAccessToken } from './middleware/authLite.js';
import { jobsRouter } from './routes/jobs.js';
import { previewRouter } from './routes/preview.js';
import { createPreviewStore } from './services/previews.js';
import { getPublicBase } from './utils/publicBase.js';

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
const PUBLIC_BASE = getPublicBase();

const app = express();
const PORT = Number(process.env.PORT || 3080);
const CLIENT_DIST = process.env.CLIENT_DIST || path.resolve(rootDir, '../client/dist');

// Accept both /api/... and /temecriack/pdf-compiler/api/... (gateway may or may not strip).
if (PUBLIC_BASE) {
  app.use((req, _res, next) => {
    if (req.url === PUBLIC_BASE || req.url.startsWith(`${PUBLIC_BASE}/`)) {
      req.url = req.url.slice(PUBLIC_BASE.length) || '/';
    }
    next();
  });
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Docker / autoheal healthcheck — must stay unauthenticated.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// All other /api/* require access JWT (Bearer or SSO cookie).
app.use('/api', requireAccessToken);

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
  const pathHint = PUBLIC_BASE || '';
  console.log(`pdf-compiler server on http://localhost:${PORT}${pathHint}/`);
});
