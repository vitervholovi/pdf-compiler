/** Build a same-origin API path under Vite `base` (e.g. `/pdf-compiler/api/...`). */
export function apiUrl(path) {
  const base = import.meta.env.BASE_URL || '/';
  const rel = String(path || '').replace(/^\//, '');
  return new URL(rel, window.location.origin + base).pathname;
}
