/**
 * Public URL prefix when served behind the monorepo gateway
 * (e.g. `/temecriack/pdf-compiler`). Empty string = app at site root.
 * Trailing slashes are stripped so strip/prefix logic stays consistent.
 */
export function getPublicBase() {
  const raw = process.env.PUBLIC_BASE;
  if (raw === undefined || raw === null) return '/temecriack/pdf-compiler';
  if (!raw || raw === '/') return '';
  return String(raw).replace(/\/$/, '');
}

/** Prefix absolute API paths returned to the browser. */
export function publicApiPath(apiPath) {
  const base = getPublicBase();
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  return `${base}${path}`;
}
