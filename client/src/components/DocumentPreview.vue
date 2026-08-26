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
      <p class="hint" :class="{ 'hint--empty': !statusHint }">{{ statusHint || '\u00a0' }}</p>

      <div class="stage" :style="stageStyle">
        <div class="page-frame" aria-hidden="true">
          <span class="page-label">A4</span>
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
            :style="boxPosStyle(pos, textPlace().transform.rotationDeg)"
          >
            <span class="wm-visual wm-text" :style="textVisualStyle">{{ wm.text.value }}</span>
          </div>
        </template>
        <template v-if="wm.image.enabled && imagePreviewUrl">
          <div
            v-for="(pos, idx) in imageGhosts"
            :key="'ig-' + idx"
            class="wm ghost"
            :style="boxPosStyle(pos, imagePlace().transform.rotationDeg)"
          >
            <img class="wm-visual" :src="imagePreviewUrl" alt="" :style="imageVisualStyle" />
          </div>
        </template>

        <div
          v-if="wm.text.enabled"
          class="wm primary"
          :class="{ active: active === 'text' }"
          :style="boxPosStyle(textPrimary, textPlace().transform.rotationDeg)"
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
            title="Обертати (Shift — по 15°)"
            @pointerdown.stop="onRotateDown($event, 'text')"
          />
        </div>

        <div
          v-if="wm.image.enabled && imagePreviewUrl"
          class="wm primary"
          :class="{ active: active === 'image' }"
          :style="boxPosStyle(imagePrimary, imagePlace().transform.rotationDeg)"
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
            title="Обертати (Shift — по 15°)"
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
import { previewFontCssFamily } from '../utils/fonts.js';
import {
  pageOrientation,
  rotationDeg,
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

const emit = defineEmits(['update:watermark', 'update:pageOrientation', 'update:pageLocked']);

const A4_PORTRAIT = { w: 595.28, h: 841.89 };
const A4_LANDSCAPE = { w: 841.89, h: 595.28 };

function a4PageSizeFor(ori) {
  return ori === 'landscape' ? { ...A4_LANDSCAPE } : { ...A4_PORTRAIT };
}

const wrap = ref(null);
const canvas = ref(null);
const page = ref(1);
const pageCount = ref(0);
const pageSize = ref({ w: 595.28, h: 841.89 });
const displayScale = ref(0.75);
const imagePreviewUrl = ref(null);
/** naturalHeight / naturalWidth of watermark image (matches server embed aspect) */
const imageAspect = ref(0.75);
/** Bumped when webfonts ready so textMetrics recomputes */
const fontsReadyTick = ref(0);
const docImageUrl = ref(null);
const active = ref(null);
const hasPdf = ref(false);
const hasImage = ref(false);
const handles = ['nw', 'ne', 'sw', 'se'];
const stageReady = ref(false);
/** Last orientation we fit the stage for — refit only when this changes or wrap resizes. */
const fittedOrientation = ref(null);

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

watch(
  [hasPdf, hasImage],
  () => emit('update:pageLocked', !!(hasPdf.value || hasImage.value)),
  { immediate: true }
);

/** Blank stage follows orientation switch (no document loaded). */
watch(
  () => props.editOrientation,
  (ori) => {
    if (hasPdf.value || hasImage.value) return;
    if (ori !== 'landscape' && ori !== 'portrait') return;
    applyPageOrientation(ori);
  }
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

let measureCtx = null;
function getMeasureCtx() {
  if (!measureCtx && typeof document !== 'undefined') {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  return measureCtx;
}

/** PDF-pt text block size (same lineHeight as server), then scaled to stage px. */
function textMetrics() {
  void fontsReadyTick.value;
  const place = textPlace();
  const fontSizePt = Number(place.fontSizePt) || 48;
  const lineHeightPt = fontSizePt * 1.25;
  const lines = String(wm.text.value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const family = previewFontCssFamily(place.fontFamily, wm.text.value);
  const weight = place.bold ? '700' : '400';
  const style = place.italic ? 'italic' : 'normal';
  // Measure at 100px then scale → PDF pt (pdf-lib uses 1pt ≈ same relative glyph width)
  const samplePx = 100;
  const ctx = getMeasureCtx();
  let maxWPt = fontSizePt * 0.5;
  if (ctx) {
    ctx.font = `${style} ${weight} ${samplePx}px ${family}`;
    let maxPx = 0;
    for (const line of lines) {
      maxPx = Math.max(maxPx, ctx.measureText(line || ' ').width);
    }
    maxWPt = (maxPx / samplePx) * fontSizePt;
  }
  const textWPt = Math.max(1, maxWPt);
  const textHPt = Math.max(fontSizePt, lines.length * lineHeightPt);
  const scale = displayScale.value || 1;
  // Stage maps 1 PDF pt → displayScale CSS px (same as pdf.js viewport). Do NOT use 96/72.
  const fontPx = fontSizePt * scale;
  return {
    w: Math.max(8, textWPt * scale),
    h: Math.max(8, textHPt * scale),
    fontPx,
    fontCss: family
  };
}

function imageMetrics() {
  const place = imagePlace();
  const w = stageW.value * (place.transform.wPct || 0.35);
  const aspect = imageAspect.value > 0 ? imageAspect.value : 0.75;
  return { w, h: Math.max(8, w * aspect) };
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
    pattern: place.pattern,
    pageW: stageW.value,
    pageH: stageH.value,
    primaryLeft: p.left,
    primaryTop: p.top,
    boxW: p.w,
    boxH: p.h,
    rotationDeg: rotationDeg(place.transform.rotationDeg),
    spacingX: (Number(place.spacingX) || 0) * scale,
    spacingY: (Number(place.spacingY) || 0) * scale
  });
});

const imageGhosts = computed(() => {
  const p = imagePrimary.value;
  const place = imagePlace();
  const scale = displayScale.value || 1;
  return tileGhostsFromPrimary({
    pattern: place.pattern,
    pageW: stageW.value,
    pageH: stageH.value,
    primaryLeft: p.left,
    primaryTop: p.top,
    boxW: p.w,
    boxH: p.h,
    rotationDeg: rotationDeg(place.transform.rotationDeg),
    spacingX: (Number(place.spacingX) || 0) * scale,
    spacingY: (Number(place.spacingY) || 0) * scale
  });
});

const textVisualStyle = computed(() => {
  const { fontPx, fontCss } = textMetrics();
  const place = textPlace();
  const align = place.align || 'center';
  return {
    color: place.color,
    opacity: place.opacity,
    fontSize: `${fontPx}px`,
    fontFamily: fontCss,
    fontWeight: place.bold ? '700' : '400',
    fontStyle: place.italic ? 'italic' : 'normal',
    textDecoration: place.underline ? 'underline' : 'none',
    textAlign: align
  };
});

const imageVisualStyle = computed(() => {
  const place = imagePlace();
  return {
    opacity: place.opacity,
    filter: place.grayscale ? 'grayscale(1)' : 'none',
    width: '100%',
    height: '100%',
    objectFit: 'contain'
  };
});

function boxPosStyle(pos, angleDeg = 0) {
  const rot = rotationDeg(angleDeg);
  const style = {
    left: `${pos.left}px`,
    top: `${pos.top}px`,
    width: `${pos.w}px`,
    height: `${pos.h}px`
  };
  if (rot !== 0) style.transform = `rotate(${rot}deg)`;
  return style;
}

function applyPageOrientation(ori) {
  const slot = ori === 'landscape' ? 'landscape' : 'portrait';
  const next = a4PageSizeFor(slot);
  const oriChanged = fittedOrientation.value !== slot;
  pageSize.value = next;
  if (oriChanged || !stageReady.value) {
    fittedOrientation.value = slot;
    nextTick(() => fitScale(next.w, next.h));
  }
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
  const ori =
    props.editOrientation === 'landscape' || props.editOrientation === 'portrait'
      ? props.editOrientation
      : 'portrait';
  applyPageOrientation(ori);
}

function onDocImageLoad(e) {
  const img = e.target;
  const nw = img.naturalWidth || 595;
  const nh = img.naturalHeight || 842;
  pageCount.value = 1;
  applyPageOrientation(pageOrientation(nw, nh));
}

async function loadPdfFromBuffer(data) {
  if (!data) throw new Error('empty PDF buffer');
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  pdfDoc = doc;
  pageCount.value = doc.numPages;
  page.value = 1;
  hasPdf.value = true;
  hasImage.value = false;
  await nextTick();
  await nextTick();
  await renderPage();
}

async function loadPreview() {
  const gen = ++renderGen;
  await cleanupPdf();
  if (gen !== renderGen) return;

  docImageUrl.value = null;
  hasImage.value = false;
  hasPdf.value = false;

  const f = props.file;
  if (!f) {
    if (gen === renderGen) resetBlank();
    return;
  }

  try {
    // 1) Client PDF cache (server preview or local PDF)
    if (hasCachedPdf(f.id)) {
      if (gen !== renderGen) return;
      await loadPdfFromBuffer(takePdfCopy(f.id));
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
      await cacheLocalPdf(f.id, f.file);
      if (gen !== renderGen) return;
      await loadPdfFromBuffer(takePdfCopy(f.id));
      return;
    }

    // 4) Server quick PDF ready
    if (f.previewUrl && f.previewStatus === 'ready') {
      await cacheServerPreview(f.id, f.previewUrl);
      if (gen !== renderGen) return;
      await loadPdfFromBuffer(takePdfCopy(f.id));
      return;
    }

    // Converting / unsupported / error — blank page
    if (gen === renderGen) resetBlank();
  } catch (err) {
    console.error(err);
    if (gen === renderGen) resetBlank();
  }
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
  if (!pdfDoc) return;
  const gen = renderGen;
  await cancelRender();
  if (gen !== renderGen || !pdfDoc) return;

  // Ensure canvas ref after hasPdf v-show
  if (!canvas.value) {
    await nextTick();
    if (gen !== renderGen || !pdfDoc || !canvas.value) return;
  }

  const pdfPage = await pdfDoc.getPage(page.value);
  // Use page's inherent rotation only — do not add extra rotation (avoids upside-down first page).
  const rotation = pdfPage.rotate || 0;
  const unscaled = pdfPage.getViewport({ scale: 1, rotation });
  // Stage is always A4; orientation follows the real page (scale stays per orientation).
  applyPageOrientation(pageOrientation(unscaled.width, unscaled.height));
  await nextTick();
  if (gen !== renderGen) return;

  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  // Render native page; CSS stretches canvas into the A4 stage.
  const viewport = pdfPage.getViewport({
    scale: displayScale.value * outputScale,
    rotation
  });
  const c = canvas.value;
  if (!c) return;
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
  () => [
    props.file?.id,
    props.file?.previewUrl,
    props.file?.previewStatus,
    props.file?.previewKind,
    props.file?.previewEpoch
  ],
  () => {
    loadPreview();
  },
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
  // Re-measure text after DejaVu loads (avoids Segoe fallback metrics)
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    document.fonts.ready.then(() => {
      fontsReadyTick.value += 1;
    });
  }
});

watch(
  () => props.watermarkImageFile,
  (f) => {
    if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value);
    imagePreviewUrl.value = f ? URL.createObjectURL(f) : null;
    imageAspect.value = 0.75;
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0) {
        imageAspect.value = img.naturalHeight / img.naturalWidth;
      }
    };
    img.src = imagePreviewUrl.value;
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
    origRot: rotationDeg(place.transform.rotationDeg)
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
    if (e.shiftKey) {
      next = Math.round(next / 15) * 15;
      if (next === -180) next = 180;
    } else {
      next = Math.round(next);
    }
    wm[drag.kind][ori].transform.rotationDeg = next;
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
