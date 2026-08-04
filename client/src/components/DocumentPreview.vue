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
            <span class="wm-visual" :style="textVisualStyle">{{ wm.text.value }}</span>
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
          <span class="wm-visual" :style="textVisualStyle">{{ wm.text.value || ' ' }}</span>
          <span
            v-for="h in handles"
            :key="'th-' + h"
            class="handle"
            :data-handle="h"
            @pointerdown.stop="onResizeDown($event, 'text', h)"
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

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

function clonePlain(value) {
  return JSON.parse(JSON.stringify(toRaw(value)));
}

const props = defineProps({
  file: { type: Object, default: null },
  watermark: { type: Object, required: true },
  watermarkImageFile: { type: File, default: null }
});

const emit = defineEmits(['update:watermark']);

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

const statusHint = computed(() => {
  const f = props.file;
  if (!f) return 'Порожня сторінка A4 — можна одразу налаштувати watermark';
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

watch(
  () => props.watermark,
  (v) => {
    if (drag) return;
    syncingFromParent = true;
    Object.assign(wm.text, clonePlain(v.text));
    Object.assign(wm.image, clonePlain(v.image));
    syncingFromParent = false;
  },
  { deep: true }
);

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
  const fontPx = (wm.text.fontSizePt || 48) * displayScale.value * (96 / 72);
  return {
    w: Math.max(48, (wm.text.value?.length || 1) * fontPx * 0.55),
    h: Math.max(28, fontPx * 1.3),
    fontPx
  };
}

function imageMetrics() {
  const w = stageW.value * (wm.image.transform.wPct || 0.35);
  return { w, h: Math.max(24, w * 0.75) };
}

const textPrimary = computed(() => {
  const { w, h } = textMetrics();
  const t = wm.text.transform;
  return {
    left: stageW.value * t.xPct - w / 2,
    top: stageH.value * t.yPct - h / 2,
    w,
    h
  };
});

const imagePrimary = computed(() => {
  const { w, h } = imageMetrics();
  const t = wm.image.transform;
  return {
    left: stageW.value * t.xPct - w / 2,
    top: stageH.value * t.yPct - h / 2,
    w,
    h
  };
});

const textGhosts = computed(() => {
  const p = textPrimary.value;
  return tileGhostsFromPrimary({
    pattern: wm.text.pattern,
    pageW: stageW.value,
    pageH: stageH.value,
    primaryLeft: p.left,
    primaryTop: p.top,
    boxW: p.w,
    boxH: p.h
  });
});

const imageGhosts = computed(() => {
  const p = imagePrimary.value;
  return tileGhostsFromPrimary({
    pattern: wm.image.pattern,
    pageW: stageW.value,
    pageH: stageH.value,
    primaryLeft: p.left,
    primaryTop: p.top,
    boxW: p.w,
    boxH: p.h
  });
});

const textVisualStyle = computed(() => {
  const { fontPx } = textMetrics();
  return {
    color: wm.text.color,
    opacity: wm.text.opacity,
    fontSize: `${fontPx}px`,
    fontFamily: fontCssFamily(wm.text.fontFamily),
    fontWeight: wm.text.bold ? '700' : '400',
    fontStyle: wm.text.italic ? 'italic' : 'normal',
    textDecoration: wm.text.underline ? 'underline' : 'none',
    transform: `rotate(${wm.text.transform.rotationDeg || 0}deg)`
  };
});

const imageVisualStyle = computed(() => ({
  opacity: wm.image.opacity,
  filter: wm.image.grayscale ? 'grayscale(1)' : 'none',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  transform: `rotate(${wm.image.transform.rotationDeg || 0}deg)`
}));

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
  if (docImageUrl.value) {
    URL.revokeObjectURL(docImageUrl.value);
    docImageUrl.value = null;
  }
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
  pdfDoc = await pdfjs.getDocument({ data }).promise;
  pageCount.value = pdfDoc.numPages;
  page.value = 1;
  hasPdf.value = true;
  hasImage.value = false;
  await nextTick();
  await renderPage();
}

async function loadPreview() {
  cleanupPdf();
  if (docImageUrl.value) {
    URL.revokeObjectURL(docImageUrl.value);
    docImageUrl.value = null;
  }
  hasImage.value = false;
  hasPdf.value = false;

  const f = props.file;
  if (!f) {
    resetBlank();
    return;
  }

  // Local PDF — never sent to server preview
  if (f.previewKind === 'local-pdf' && f.file) {
    try {
      const data = await f.file.arrayBuffer();
      await loadPdfFromBuffer(data);
    } catch (err) {
      console.error(err);
      resetBlank();
    }
    return;
  }

  // Local image
  if (f.previewKind === 'local-image' && f.file) {
    docImageUrl.value = URL.createObjectURL(f.file);
    hasImage.value = true;
    pageCount.value = 1;
    page.value = 1;
    return;
  }

  // Server quick PDF ready
  if (f.previewUrl && f.previewStatus === 'ready') {
    try {
      const res = await fetch(f.previewUrl);
      if (!res.ok) throw new Error('preview fetch failed');
      const data = await res.arrayBuffer();
      await loadPdfFromBuffer(data);
    } catch (err) {
      console.error(err);
      resetBlank();
    }
    return;
  }

  // Converting / unsupported / error — blank page, watermark still interactive
  resetBlank();
}

async function renderPage() {
  if (!pdfDoc || !canvas.value) return;
  const pdfPage = await pdfDoc.getPage(page.value);
  const unscaled = pdfPage.getViewport({ scale: 1 });
  pageSize.value = { w: unscaled.width, h: unscaled.height };
  await nextTick();
  fitScale(unscaled.width, unscaled.height);
  const viewport = pdfPage.getViewport({ scale: displayScale.value });
  const c = canvas.value;
  c.width = viewport.width;
  c.height = viewport.height;
  const ctx = c.getContext('2d');
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
}

function cleanupPdf() {
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
onMounted(() => {
  resetBlank();
  if (wrap.value && typeof ResizeObserver !== 'undefined') {
    resizeObs = new ResizeObserver(() => {
      fitScale(pageSize.value.w, pageSize.value.h);
      if (pdfDoc) renderPage();
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
  const t = wm[kind].transform;
  drag = {
    mode: 'move',
    kind,
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
  const t = wm[kind].transform;
  drag = {
    mode: 'resize',
    kind,
    handle,
    startX: e.clientX,
    startY: e.clientY,
    origW: kind === 'image' ? t.wPct : wm.text.fontSizePt,
    origX: t.xPct,
    origY: t.yPct,
    alt: e.altKey,
    shift: e.shiftKey
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

  if (drag.mode === 'move') {
    wm[drag.kind].transform.xPct = clamp(drag.origX + dx / sw, 0.02, 0.98);
    wm[drag.kind].transform.yPct = clamp(drag.origY + dy / sh, 0.02, 0.98);
    return;
  }

  const signX = drag.handle.includes('e') ? 1 : -1;
  const alt = e.altKey || drag.alt;
  if (drag.kind === 'image') {
    const nextW = clamp(drag.origW + (dx * signX) / sw, 0.05, 1);
    wm.image.transform.wPct = nextW;
    if (!alt) {
      const dw = nextW - drag.origW;
      if (drag.handle.includes('e')) {
        wm.image.transform.xPct = clamp(drag.origX + dw / 2, 0.02, 0.98);
      } else if (drag.handle.includes('w')) {
        wm.image.transform.xPct = clamp(drag.origX - dw / 2, 0.02, 0.98);
      }
    }
  } else {
    wm.text.fontSizePt = clamp(Math.round(drag.origW + dx * signX * 0.25), 6, 200);
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
  cleanupPdf();
  resizeObs?.disconnect();
  if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value);
  if (docImageUrl.value) URL.revokeObjectURL(docImageUrl.value);
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
});
</script>

<style scoped lang="scss">
.preview {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: var(--surface);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.title {
  font-size: 0.9rem;
  font-weight: 600;
}

.pager {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}

.hint {
  margin: 0 0 6px;
  font-size: 0.75rem;
  color: var(--muted);
  text-align: center;
  width: 100%;
  flex-shrink: 0;
}

.stage-wrap {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 12px;
  background: #e8e8e4;
  min-height: 360px;
}

.stage {
  position: relative;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.14);
  border: 1px solid #cfcfc9;
  overflow: hidden;
  flex-shrink: 0;
  min-width: 200px;
  min-height: 280px;
}

.page-frame {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    linear-gradient(#f3f3f0 1px, transparent 1px) 0 0 / 100% 24px,
    #fff;
  opacity: 0.35;
}

.page-label {
  position: absolute;
  top: 10px;
  right: 12px;
  font-size: 0.75rem;
  color: #888;
  letter-spacing: 0.04em;
}

.blank-page {
  position: absolute;
  inset: 0;
  background: transparent;
  z-index: 0;
}

.page-canvas {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
  user-select: none;
}

.page-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.wm {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  touch-action: none;
  user-select: none;

  &.ghost {
    z-index: 1;
    pointer-events: none;
  }

  &.primary {
    z-index: 5;
    cursor: move;
    border: 1px dashed rgba(44, 95, 74, 0.55);
    background: rgba(44, 95, 74, 0.04);
  }

  &.active {
    border-color: var(--accent);
    outline: 1px solid var(--accent);
  }
}

.wm-visual {
  pointer-events: none;
  white-space: nowrap;
  line-height: 1;
  max-width: 100%;
  max-height: 100%;
}

.wm-placeholder {
  position: absolute;
  inset: 40% 10%;
  z-index: 3;
  text-align: center;
  color: var(--muted);
  font-size: 0.85rem;
  pointer-events: none;
}

.handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--accent);
  border: 2px solid #fff;
  z-index: 6;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);

  &[data-handle='nw'] { left: -6px; top: -6px; cursor: nwse-resize; }
  &[data-handle='ne'] { right: -6px; top: -6px; cursor: nesw-resize; }
  &[data-handle='sw'] { left: -6px; bottom: -6px; cursor: nesw-resize; }
  &[data-handle='se'] { right: -6px; bottom: -6px; cursor: nwse-resize; }
}
</style>
