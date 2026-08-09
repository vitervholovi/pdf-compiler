import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Vite `base` (trailing slash). Must match monorepo `PDF_COMPILER_SUBPATH` + `/`. */
const base = process.env.VITE_BASE || '/temecriack/pdf-compiler/';
/** Same prefix without trailing slash — used for gateway-style `/…/api` dev proxy. */
const basePrefix = base.replace(/\/$/, '') || '';

export default defineConfig({
  plugins: [vue()],
  base,
  resolve: {
    alias: [
      {
        find: '@temecriack/session',
        replacement: path.resolve(
          __dirname,
          'src/vendor/temecriack-session/index.js',
        ),
      },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      // Gateway may keep the public prefix on API paths during local Vite dev.
      [`^${basePrefix}/api`]: {
        target: 'http://localhost:3080',
        rewrite: (p) =>
          (p.startsWith(basePrefix) ? p.slice(basePrefix.length) : p) || '/'
      },
      '/api': 'http://localhost:3080'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
