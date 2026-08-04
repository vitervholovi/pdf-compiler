export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extOf(name = '') {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

const ICON_MAP = {
  pdf: { icon: 'vscode-icons:file-type-pdf2', color: '#e53935' },
  doc: { icon: 'vscode-icons:file-type-word', color: '#1e88e5' },
  docx: { icon: 'vscode-icons:file-type-word', color: '#1e88e5' },
  odt: { icon: 'vscode-icons:file-type-word', color: '#1e88e5' },
  rtf: { icon: 'vscode-icons:file-type-word', color: '#1e88e5' },
  xls: { icon: 'vscode-icons:file-type-excel', color: '#43a047' },
  xlsx: { icon: 'vscode-icons:file-type-excel', color: '#43a047' },
  ods: { icon: 'vscode-icons:file-type-excel', color: '#43a047' },
  csv: { icon: 'vscode-icons:file-type-excel', color: '#43a047' },
  ppt: { icon: 'vscode-icons:file-type-powerpoint', color: '#fb8c00' },
  pptx: { icon: 'vscode-icons:file-type-powerpoint', color: '#fb8c00' },
  odp: { icon: 'vscode-icons:file-type-powerpoint', color: '#fb8c00' },
  txt: { icon: 'vscode-icons:file-type-text', color: '#546e7a' },
  md: { icon: 'vscode-icons:file-type-markdown', color: '#546e7a' },
  json: { icon: 'vscode-icons:file-type-json', color: '#f9a825' },
  png: { icon: 'vscode-icons:file-type-image', color: '#8e24aa' },
  jpg: { icon: 'vscode-icons:file-type-image', color: '#8e24aa' },
  jpeg: { icon: 'vscode-icons:file-type-image', color: '#8e24aa' },
  webp: { icon: 'vscode-icons:file-type-image', color: '#8e24aa' },
  gif: { icon: 'vscode-icons:file-type-image', color: '#8e24aa' },
  bmp: { icon: 'vscode-icons:file-type-image', color: '#8e24aa' },
  tiff: { icon: 'vscode-icons:file-type-image', color: '#8e24aa' },
  tif: { icon: 'vscode-icons:file-type-image', color: '#8e24aa' },
  djvu: { icon: 'mdi:file-document-outline', color: '#6d4c41' },
  djv: { icon: 'mdi:file-document-outline', color: '#6d4c41' }
};

export function fileTypeMeta(name) {
  const ext = extOf(name);
  return ICON_MAP[ext] || { icon: 'mdi:file-outline', color: '#78909c' };
}

const PREVIEWABLE = new Set([
  'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif'
]);

export function canPreviewClient(name) {
  return PREVIEWABLE.has(extOf(name));
}

export function isImageFile(name) {
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif'].includes(extOf(name));
}

export function isPdfFile(name) {
  return extOf(name) === 'pdf';
}

/** Formats that need server-side quick PDF for document preview */
export function needsServerPreview(name) {
  if (isPdfFile(name) || isImageFile(name)) return false;
  const e = extOf(name);
  const server = new Set([
    'doc', 'docx', 'odt', 'rtf',
    'xls', 'xlsx', 'ods', 'csv',
    'ppt', 'pptx', 'odp',
    'txt', 'md', 'json', 'log', 'xml', 'html', 'htm',
    'djvu', 'djv'
  ]);
  return server.has(e);
}

export function defaultWatermark() {
  return {
    text: {
      enabled: true,
      value: 'CONFIDENTIAL',
      fontFamily: 'Helvetica',
      fontSizePt: 48,
      bold: true,
      italic: false,
      underline: false,
      color: '#000000',
      opacity: 0.25,
      pattern: 'single',
      transform: { xPct: 0.5, yPct: 0.5, wPct: 0.5, rotationDeg: -30 }
    },
    image: {
      enabled: false,
      opacity: 0.3,
      grayscale: false,
      pattern: 'single',
      transform: { xPct: 0.5, yPct: 0.5, wPct: 0.35, rotationDeg: 0 }
    }
  };
}
