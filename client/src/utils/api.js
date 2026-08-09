import { authFetch } from '@temecriack/session';

/**
 * Build a same-origin API path under Vite `base`
 * (e.g. `/temecriack/pdf-compiler/api/...`).
 *
 * @param {string} path
 * @returns {string}
 */
export function apiUrl(path) {
  const base = import.meta.env.BASE_URL || '/';
  const rel = String(path || '').replace(/^\//, '');
  return new URL(rel, window.location.origin + base).pathname;
}

/**
 * Authenticated fetch for pdf-compiler `/api/*`.
 * Attaches Bearer from the SSO cookie/store and refreshes once on 401.
 * Re-exported so callers do not import the vendor path directly.
 *
 * @param {string} url
 * @param {RequestInit & { skipAuth?: boolean }} [init]
 */
export { authFetch };

/**
 * Convenience: `authFetch(apiUrl(path), init)`.
 *
 * @param {string} path relative to Vite base (e.g. `api/preview`)
 * @param {RequestInit & { skipAuth?: boolean }} [init]
 */
export function apiFetch(path, init) {
  return authFetch(apiUrl(path), init);
}
