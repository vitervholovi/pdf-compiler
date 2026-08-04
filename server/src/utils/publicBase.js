/** Public URL prefix when served behind a gateway (e.g. `/pdf-compiler`). Empty = root. */
export function getPublicBase() {
  const raw = process.env.PUBLIC_BASE;
  if (raw === undefined || raw === null) return '/pdf-compiler';
  if (!raw || raw === '/') return '';
  return String(raw).replace(/\/$/, '');
}

/** Prefix absolute API paths returned to the browser. */
export function publicApiPath(apiPath) {
  const base = getPublicBase();
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  return `${base}${path}`;
}
