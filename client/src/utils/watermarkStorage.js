/**
 * Persist last watermark settings (+ image) in localStorage.
 * Same payload shape as JSON export/import (version 1).
 */
import { buildWatermarkExport, parseWatermarkImport } from './watermarkIo.js';

export const WM_STORAGE_KEY = 'pdf-compiler:watermark-settings';

export async function saveWatermarkToStorage(watermark, imageFile) {
  const payload = await buildWatermarkExport(watermark, imageFile);
  try {
    localStorage.setItem(WM_STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Не вдалося зберегти watermark у localStorage', e);
    throw e;
  }
  return payload;
}

/**
 * @returns {Promise<{ watermark: object, imageFile: File|null }|null>}
 */
export async function loadWatermarkFromStorage() {
  let raw;
  try {
    raw = localStorage.getItem(WM_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  const blob = new Blob([raw], { type: 'application/json' });
  const file = new File([blob], 'local-watermark.json', { type: 'application/json' });
  try {
    return await parseWatermarkImport(file);
  } catch (e) {
    console.warn('Пошкоджені налаштування watermark у localStorage', e);
    return null;
  }
}

export function clearWatermarkStorage() {
  try {
    localStorage.removeItem(WM_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
