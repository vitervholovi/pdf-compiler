import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const base = process.env.VITE_BASE || '/pdf-compiler/';

export default defineConfig({
  plugins: [vue()],
  base,
  server: {
    port: 5173,
    proxy: {
      // Gateway-style paths when base is /pdf-compiler/
      '^/pdf-compiler/api': {
        target: 'http://localhost:3080',
        rewrite: (p) => p.replace(/^\/pdf-compiler/, '') || '/'
      },
      '/api': 'http://localhost:3080'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
