<template>
  <section class="preview panel">
    <div class="toolbar">
      <span class="title">Передперегляд</span>
      <div v-if="pageCount > 0" class="pager">
        <button type="button" class="btn" :disabled="page <= 1" @click="page--">←</button>
        <span>{{ page }} / {{ pageCount }}</span>
        <button type="button" class="btn" :disabled="page >= pageCount" @click="page++">→</button>
      </div>
    </div>

    <div class="stage-wrap" ref="wrap">
      <p v-if="statusHint" class="hint">{{ statusHint }}</p>

      <div class="stage" :style="stageStyle">
        <div class="page-frame" aria-hidden="true">
          <span v-if="!hasPdf && !hasImage" class="page-label">A4</span>
        </div>
        <canvas ref="canvas" class="page-canvas" v-show="hasPdf" />
        <img
          v-if="hasImage && docImageUrl"
          :src="docImageUrl"
          class="page-image"
          alt=""
          @load="onDocImageLoad"
        />
        <div v-if="!hasPdf && !hasImage" class="blank-page" />

        <template v-if="wm.text.enabled">
          <div
            v-for="(pos, idx) in textGhosts"
            :key="'tg-' + idx"
            class="wm ghost"
            :style="boxPosStyle(pos)"
          >
            <span class="wm-visual wm-text" :style="textVisualStyle">{{ wm.text.value }}</span>
          </div>
        </template>
        <template v-if="wm.image.enabled && imagePreviewUrl">
          <div
            v-for="(pos, idx) in imageGhosts"
            :key="'ig-' + idx"
            class="wm ghost"
            :style="boxPosStyle(pos)"
          >
            <img class="wm-visual" :src="imagePreviewUrl" alt="" :style="imageVisualStyle" />
          </div>
        </template>

        <div
          v-if="wm.text.enabled"
          class="wm primary"
          :class="{ active: active === 'text' }"
          :style="boxPosStyle(textPrimary)"
          @pointerdown="onPrimaryDown($event, 'text')"
        >
          <span class="wm-visual wm-text" :style="textVisualStyle">{{ wm.text.value || ' ' }}</span>
          <span
            v-for="h in handles"
            :key="'th-' + h"
            class="handle"
            :data-handle="h"
            @pointerdown.stop="onResizeDown($event, 'text', h)"
          />
          <span
            class="rotate-handle"
            title="Обертати"
            @pointerdown.stop="onRotateDown($event, 'text')"
          />
        </div>

        <div
          v-if="wm.image.enabled && imagePreviewUrl"
          class="wm primary"
          :class="{ active: active === 'image' }"
          :style="boxPosStyle(imagePrimary)"
          @pointerdown="onPrimaryDown($event, 'image')"
        >
          <img class="wm-visual" :src="imagePreviewUrl" alt="" :style="imageVisualStyle" />
          <span
            v-for="h in handles"
            :key="'ih-' + h"
            class="handle"
            :data-handle="h"
            @pointerdown.stop="onResizeDown($event, 'image', h)"
          />
          <span
            class="rotate-handle"
            title="Обертати"
            @pointerdown.stop="onRotateDown($event, 'image')"
          />
        </div>
        <div v-else-if="wm.image.enabled && !imagePreviewUrl" class="wm-placeholder">
          Оберіть зображення watermark зліва
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount, onMounted, nextTick, reactive, toRaw } from 'vue';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { tileGhostsFromPrimary } from '../utils/tiling.js';
import { fontCssFamily } from '../utils/fonts.js';
import {
  pageOrientation,
  getTextPlacement,
  getImagePlacement
} from '../utils/watermarkModel.js';
import {
  hasCachedPdf,
  takePdfCopy,
  cacheLocalPdf,
  cacheLocalImage,
  cacheServerPreview,
  getCachedImageUrl
} from '../utils/previewCache.js';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

function clonePlain(value) {
  return JSON.parse(JSON.stringify(toRaw(value)));
}

const props = defineProps({
  file: { type: Object, default: null },
  watermark: { type: Object, required: true },
  watermarkImageFile: { type: File, default: null },
  /** When set, preview edits this orientation slot instead of auto page orientation */
  editOrientation: { type: String, default: null }
});

const emit = defineEmits(['update:watermark', 'update:pageOrientation']);

const wrap = ref(null);
const canvas = ref(null);
const page = ref(1);
const pageCount = ref(0);
const pageSize = ref({ w: 595.28, h: 841.89 });
const displayScale = ref(0.75);
const imagePreviewUrl = ref(null);
const docImageUrl = ref(null);
const active = ref(null);
const hasPdf = ref(false);
const hasImage = ref(false);
const handles = ['nw', 'ne', 'sw', 'se'];
const stageReady = ref(false);

const wm = reactive(clonePlain(props.watermark));

const pageOri = computed(() => pageOrientation(pageSize.value.w, pageSize.value.h));
const orientation = computed(() =>
  props.editOrientation === 'landscape' || props.editOrientation === 'portrait'
    ? props.editOrientation
    : pageOri.value
);

watch(
  pageOri,
  (v) => emit('update:pageOrientation', v),
  { immediate: true }
);

function textPlace() {
  return getTextPlacement(wm.text, orientation.value);
}

function imagePlace() {
  return getImagePlacement(wm.image, orientation.value);
}

function ensureSlots() {
  if (!wm.text.portrait) wm.text.portrait = getTextPlacement(wm.text, 'portrait');
  if (!wm.text.landscape) wm.text.landscape = getTextPlacement(wm.text, 'landscape');
  if (!wm.image.portrait) wm.image.portrait = getImagePlacement(wm.image, 'portrait');
  if (!wm.image.landscape) wm.image.landscape = getImagePlacement(wm.image, 'landscape');
}

const statusHint = computed(() => {
  const f = props.file;
  if (!f) return 'Порожня сторінка A4 — можна одразу налаштувати watermark';
  if (hasCachedPdf(f.id) || getCachedImageUrl(f.id)) return '';
  if (f.previewStatus === 'converting' || f.previewStatus === 'pending') {
    return 'Швидкий preview ще генерується — watermark уже можна приміряти на порожній сторінці';
  }
  if (f.previewStatus === 'error') {
    return `Preview не створено (${f.previewError || 'помилка'}) — показуємо порожню сторінку`;
  }
  if (f.previewStatus === 'unsupported') {
    return 'Для цього формату точний вміст недоступний — порожня сторінка для watermark';
  }
  return '';
});

let pdfDoc = null;
let drag = null;
let syncingFromParent = false;
let renderTask = null;
let renderGen = 0;

watch(
  () => props.watermark,
  (v) => {
    if (drag) return;
    syncingFromParent = true;
    Object.assign(wm.text, clonePlain(v.text));
    Object.assign(wm.image, clonePlain(v.image));
    ensureSlots();
    syncingFromParent = false;
  },
  { deep: true }
);

ensureSlots();

function commitWm() {
  if (syncingFromParent) return;
  emit('update:watermark', clonePlain(wm));
}

const stageStyle = computed(() => {
  const w = Math.max(200, pageSize.value.w * displayScale.value);
  const h = Math.max(280, pageSize.value.h * displayScale.value);
  return {
    width: `${w}px`,
    height: `${h}px`
  };
});

const stageW = computed(() => pageSize.value.w * displayScale.value);
const stageH = computed(() => pageSize.value.h * displayScale.value);

function textMetrics() {
  const place = textPlace();
  const fontPx = (place.fontSizePt || 48) * displayScale.value * (96 / 72);
  const lines = String(wm.text.value ?? '').replace(/\r\n/g, '\n').split('\n');
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  const lineH = fontPx * 1.25;
  return {
    w: Math.max(48, maxLen * fontPx * 0.55),
    h: Math.max(28, lines.length * lineH),
    fontPx
  };
}

function imageMetrics() {
  const place = imagePlace();
  const w = stageW.value * (place.transform.wPct || 0.35);
  return { w, h: Math.max(24, w * 0.75) };
}

const textPrimary = computed(() => {
  const { w, h } = textMetrics();
  const t = textPlace().transform;
  return {
    left: stageW.value * t.xPct - w / 2,
    top: stageH.value * t.yPct - h / 2,
    w,
    h
  };
});

const imagePrimary = computed(() => {
  const { w, h } = imageMetrics();
  const t = imagePlace().transform;
  return {
    left: stageW.value * t.xPct - w / 2,
    top: stageH.value * t.yPct - h / 2,
    w,
    h
  };
});

const textGhosts = computed(() => {
  const p = textPrimary.value;
  const place = textPlace();
  const scale = displayScale.value || 1;
  return tileGhostsFromPrimary({
    pattern: wm.text.pattern,
    pageW: stageW.value,
    pageH: stageH.value,
    primaryLeft: p.left,
    primaryTop: p.top,
    boxW: p.w,
    boxH: p.h,
    rotationDeg: place.transform.rotationDeg || 0,
    spacingX: (Number(place.spacingX) || 0) * scale,
    spacingY: (Number(place.spacingY) || 0) * scale
  });
});

const imageGhosts = computed(() => {
  const p = imagePrimary.value;
  const place = imagePlace();
  const scale = displayScale.value || 1;
  return tileGhostsFromPrimary({
    pattern: wm.image.pattern,
    pageW: stageW.value,
    pageH: stageH.value,
    primaryLeft: p.left,
    primaryTop: p.top,
    boxW: p.w,
    boxH: p.h,
    rotationDeg: place.transform.rotationDeg || 0,
    spacingX: (Number(place.spacingX) || 0) * scale,
    spacingY: (Number(place.spacingY) || 0) * scale
  });
});

const textVisualStyle = computed(() => {
  const { fontPx } = textMetrics();
  const place = textPlace();
  const align = wm.text.align || 'center';
  return {
    color: wm.text.color,
    opacity: wm.text.opacity,
    fontSize: `${fontPx}px`,
    fontFamily: fontCssFamily(wm.text.fontFamily),
    fontWeight: wm.text.bold ? '700' : '400',
    fontStyle: wm.text.italic ? 'italic' : 'normal',
    textDecoration: wm.text.underline ? 'underline' : 'none',
    textAlign: align,
    transform: `rotate(${place.transform.rotationDeg || 0}deg)`
  };
});

const imageVisualStyle = computed(() => {
  const place = imagePlace();
  return {
    opacity: wm.image.opacity,
    filter: wm.image.grayscale ? 'grayscale(1)' : 'none',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    transform: `rotate(${place.transform.rotationDeg || 0}deg)`
  };
});

function boxPosStyle(pos) {
  return {
    left: `${pos.left}px`,
    top: `${pos.top}px`,
    width: `${pos.w}px`,
    height: `${pos.h}px`
  };
}

function fitScale(w, h) {
  const wrapW = wrap.value?.clientWidth || 0;
  const wrapH = wrap.value?.clientHeight || 0;
  const maxW = Math.max(200, (wrapW || 480) - 24);
  const maxH = Math.max(240, (wrapH || 420) - 36);
  const raw = Math.min(maxW / w, maxH / h, 1.05);
  displayScale.value = Math.max(0.28, raw);
  stageReady.value = true;
}

function resetBlank() {
  hasPdf.value = false;
  hasImage.value = false;
  docImageUrl.value = null;
  pageCount.value = 0;
  page.value = 1;
  pageSize.value = { w: 595.28, h: 841.89 };
  nextTick(() => fitScale(pageSize.value.w, pageSize.value.h));
}

function onDocImageLoad(e) {
  const img = e.target;
  pageSize.value = { w: img.naturalWidth || 595, h: img.naturalHeight || 842 };
  pageCount.value = 1;
  nextTick(() => fitScale(pageSize.value.w, pageSize.value.h));
}

async function loadPdfFromBuffer(data) {
  const loadingTask = pdfjs.getDocument({ data });
  pdfDoc = await loadingTask.promise;
  pageCount.value = pdfDoc.numPages;
  page.value = 1;
  hasPdf.value = true;
  hasImage.value = false;
  await nextTick();
  await renderPage();
}

async function loadPreview() {
  const gen = ++renderGen;
  await cleanupPdf();
  docImageUrl.value = null;
  hasImage.value = false;
  hasPdf.value = false;

  const f = props.file;
  if (!f) {
    if (gen === renderGen) resetBlank();
    return;
  }

  // 1) Client PDF cache (server preview or local PDF)
  if (hasCachedPdf(f.id)) {
    try {
      const data = takePdfCopy(f.id);
      if (gen !== renderGen) return;
      await loadPdfFromBuffer(data);
    } catch (err) {
      console.error(err);
      if (gen === renderGen) resetBlank();
    }
    return;
  }

  // 2) Cached / local image
  if (f.previewKind === 'local-image' && f.file) {
    if (gen !== renderGen) return;
    docImageUrl.value = cacheLocalImage(f.id, f.file);
    hasImage.value = true;
    pageCount.value = 1;
    page.value = 1;
    return;
  }
  const cachedImg = getCachedImageUrl(f.id);
  if (cachedImg) {
    if (gen !== renderGen) return;
    docImageUrl.value = cachedImg;
    hasImage.value = true;
    pageCount.value = 1;
    page.value = 1;
    return;
  }

  // 3) Local PDF — read once into cache
  if (f.previewKind === 'local-pdf' && f.file) {
    try {
      await cacheLocalPdf(f.id, f.file);
      if (gen !== renderGen) return;
      await loadPdfFromBuffer(takePdfCopy(f.id));
    } catch (err) {
      console.error(err);
      if (gen === renderGen) resetBlank();
    }
    return;
  }

  // 4) Server quick PDF ready — fetch + cache
  if (f.previewUrl && f.previewStatus === 'ready') {
    try {
      await cacheServerPreview(f.id, f.previewUrl);
      if (gen !== renderGen) return;
      await loadPdfFromBuffer(takePdfCopy(f.id));
    } catch (err) {
      console.error(err);
      if (gen === renderGen) resetBlank();
    }
    return;
  }

  // Converting / unsupported / error — blank page, watermark still interactive
  if (gen === renderGen) resetBlank();
}

async function cancelRender() {
  if (renderTask) {
    try {
      renderTask.cancel();
    } catch {
      // ignore
    }
    try {
      await renderTask.promise;
    } catch {
      // cancelled
    }
    renderTask = null;
  }
}

async function renderPage() {
  if (!pdfDoc || !canvas.value) return;
  const gen = renderGen;
  await cancelRender();
  if (gen !== renderGen || !pdfDoc || !canvas.value) return;

  const pdfPage = await pdfDoc.getPage(page.value);
  // Use page's inherent rotation only — do not add extra rotation (avoids upside-down first page).
  const rotation = pdfPage.rotate || 0;
  const unscaled = pdfPage.getViewport({ scale: 1, rotation });
  pageSize.value = { w: unscaled.width, h: unscaled.height };
  await nextTick();
  if (gen !== renderGen) return;
  fitScale(unscaled.width, unscaled.height);

  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = pdfPage.getViewport({
    scale: displayScale.value * outputScale,
    rotation
  });
  const c = canvas.value;
  c.width = Math.floor(viewport.width);
  c.height = Math.floor(viewport.height);
  c.style.width = '';
  c.style.height = '';

  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);

  renderTask = pdfPage.render({ canvasContext: ctx, viewport });
  try {
    await renderTask.promise;
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') throw err;
  } finally {
    renderTask = null;
  }
}

async function cleanupPdf() {
  await cancelRender();
  if (pdfDoc) {
    pdfDoc.destroy();
    pdfDoc = null;
  }
}

watch(
  () => [props.file?.id, props.file?.previewUrl, props.file?.previewStatus, props.file?.previewKind],
  () => loadPreview(),
  { immediate: true }
);

watch(page, () => {
  if (pdfDoc) renderPage();
});

let resizeObs = null;
let resizeTimer = null;
onMounted(() => {
  // Do not resetBlank here — immediate watch already loads the selected file.
  if (wrap.value && typeof ResizeObserver !== 'undefined') {
    resizeObs = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        fitScale(pageSize.value.w, pageSize.value.h);
        if (pdfDoc) renderPage();
      }, 80);
    });
    resizeObs.observe(wrap.value);
  }
});

watch(
  () => props.watermarkImageFile,
  (f) => {
    if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value);
    imagePreviewUrl.value = f ? URL.createObjectURL(f) : null;
  },
  { immediate: true }
);

function onPrimaryDown(e, kind) {
  e.preventDefault();
  e.stopPropagation();
  active.value = kind;
  ensureSlots();
  const t = kind === 'text' ? textPlace().transform : imagePlace().transform;
  drag = {
    mode: 'move',
    kind,
    ori: orientation.value,
    startX: e.clientX,
    startY: e.clientY,
    origX: t.xPct,
    origY: t.yPct
  };
  e.currentTarget.setPointerCapture?.(e.pointerId);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function onResizeDown(e, kind, handle) {
  e.preventDefault();
  e.stopPropagation();
  active.value = kind;
  ensureSlots();
  const place = kind === 'text' ? textPlace() : imagePlace();
  const t = place.transform;
  drag = {
    mode: 'resize',
    kind,
    ori: orientation.value,
    handle,
    startX: e.clientX,
    startY: e.clientY,
    origW: kind === 'image' ? t.wPct : place.fontSizePt,
    origX: t.xPct,
    origY: t.yPct,
    alt: e.altKey,
    shift: e.shiftKey
  };
  e.currentTarget.setPointerCapture?.(e.pointerId);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function onRotateDown(e, kind) {
  e.preventDefault();
  e.stopPropagation();
  active.value = kind;
  ensureSlots();
  const stageEl = e.currentTarget.closest('.stage');
  const rect = stageEl?.getBoundingClientRect();
  const primary = kind === 'text' ? textPrimary.value : imagePrimary.value;
  const cx = (rect?.left || 0) + primary.left + primary.w / 2;
  const cy = (rect?.top || 0) + primary.top + primary.h / 2;
  const pointerAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
  const place = kind === 'text' ? textPlace() : imagePlace();
  drag = {
    mode: 'rotate',
    kind,
    ori: orientation.value,
    cx,
    cy,
    startAngle: pointerAngle,
    origRot: Number(place.transform.rotationDeg) || 0
  };
  e.currentTarget.setPointerCapture?.(e.pointerId);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function onMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  const sw = stageW.value || 1;
  const sh = stageH.value || 1;
  const ori = drag.ori === 'landscape' ? 'landscape' : 'portrait';
  ensureSlots();

  if (drag.mode === 'move') {
    wm[drag.kind][ori].transform.xPct = clamp(drag.origX + dx / sw, 0.02, 0.98);
    wm[drag.kind][ori].transform.yPct = clamp(drag.origY + dy / sh, 0.02, 0.98);
    return;
  }

  if (drag.mode === 'rotate') {
    const angle = (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) * 180) / Math.PI;
    let next = drag.origRot + (angle - drag.startAngle);
    next = ((next + 180) % 360 + 360) % 360 - 180;
    wm[drag.kind][ori].transform.rotationDeg = Math.round(next);
    return;
  }

  const signX = drag.handle.includes('e') ? 1 : -1;
  const alt = e.altKey || drag.alt;
  if (drag.kind === 'image') {
    const nextW = clamp(drag.origW + (dx * signX) / sw, 0.05, 1);
    wm.image[ori].transform.wPct = nextW;
    if (!alt) {
      const dw = nextW - drag.origW;
      if (drag.handle.includes('e')) {
        wm.image[ori].transform.xPct = clamp(drag.origX + dw / 2, 0.02, 0.98);
      } else if (drag.handle.includes('w')) {
        wm.image[ori].transform.xPct = clamp(drag.origX - dw / 2, 0.02, 0.98);
      }
    }
  } else {
    wm.text[ori].fontSizePt = clamp(Math.round(drag.origW + dx * signX * 0.25), 6, 200);
  }
}

function onUp() {
  if (drag) {
    drag = null;
    commitWm();
  }
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

onBeforeUnmount(() => {
  clearTimeout(resizeTimer);
  cleanupPdf();
  resizeObs?.disconnect();
  if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value);
  // docImageUrl is owned by previewCache — do not revoke here
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
});
</script>
