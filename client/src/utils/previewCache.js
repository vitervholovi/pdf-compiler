/**
 * Client-side preview cache.
 * PDF bytes / image object URLs live here so switching files or deleting
 * server temp previews after a job does not wipe the UI preview.
 */

import { authFetch } from './api.js';

const pdfBuffers = new Map();
const imageUrls = new Map();
const inflight = new Map();

export function hasCachedPdf(id) {
  return pdfBuffers.has(id);
}

export function getCachedPdf(id) {
  return pdfBuffers.get(id) || null;
}

/** pdf.js may detach the buffer — always pass a copy to getDocument. */
export function takePdfCopy(id) {
  const buf = pdfBuffers.get(id);
  return buf ? buf.slice(0) : null;
}

export function setCachedPdf(id, buffer) {
  if (!id || !buffer) return;
  pdfBuffers.set(id, buffer);
}

export function getCachedImageUrl(id) {
  return imageUrls.get(id) || null;
}

export function cacheLocalImage(id, file) {
  if (!id || !file) return null;
  const existing = imageUrls.get(id);
  if (existing) return existing;
  const url = URL.createObjectURL(file);
  imageUrls.set(id, url);
  return url;
}

export async function cacheLocalPdf(id, file) {
  if (!id || !file) return null;
  if (pdfBuffers.has(id)) return pdfBuffers.get(id);
  if (inflight.has(id)) return inflight.get(id);

  const task = file.arrayBuffer().then((buf) => {
    pdfBuffers.set(id, buf);
    inflight.delete(id);
    return buf;
  }).catch((err) => {
    inflight.delete(id);
    throw err;
  });
  inflight.set(id, task);
  return task;
}

/** Fetch server preview URL once and keep bytes locally. */
export async function cacheServerPreview(id, url) {
  if (!id || !url) return null;
  if (pdfBuffers.has(id)) return pdfBuffers.get(id);
  if (inflight.has(id)) return inflight.get(id);

  const task = (async () => {
    const res = await authFetch(url);
    if (!res.ok) throw new Error(`preview fetch failed (${res.status})`);
    const buf = await res.arrayBuffer();
    pdfBuffers.set(id, buf);
    return buf;
  })()
    .finally(() => {
      inflight.delete(id);
    });

  inflight.set(id, task);
  return task;
}

export function releasePreviewCache(id) {
  if (!id) return;
  pdfBuffers.delete(id);
  inflight.delete(id);
  const url = imageUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    imageUrls.delete(id);
  }
}
