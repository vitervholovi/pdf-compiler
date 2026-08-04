/**
 * Save / load watermark settings as JSON (image as base64).
 */

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Не вдалося прочитати файл'));
    reader.readAsDataURL(file);
  });
}

function base64ToFile(base64, name, mimeType) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name || 'watermark.png', {
    type: mimeType || 'application/octet-stream'
  });
}

export async function buildWatermarkExport(watermark, imageFile) {
  const payload = {
    version: 1,
    watermark: JSON.parse(JSON.stringify(watermark))
  };

  if (imageFile) {
    payload.image = {
      name: imageFile.name || 'watermark.png',
      mimeType: imageFile.type || 'application/octet-stream',
      base64: await fileToBase64(imageFile)
    };
  }

  return payload;
}

export function downloadWatermarkJson(payload, filename = 'watermark-settings.json') {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function parseWatermarkImport(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Невалідний JSON');
  }

  if (!data || typeof data !== 'object' || !data.watermark) {
    throw new Error('У файлі немає поля watermark');
  }

  let imageFile = null;
  if (data.image?.base64) {
    imageFile = base64ToFile(
      data.image.base64,
      data.image.name || 'watermark.png',
      data.image.mimeType || 'image/png'
    );
  }

  return {
    watermark: data.watermark,
    imageFile
  };
}
