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
      <p v-if="!file" class="hint">Оберіть файл — після швидкої конвертації з’явиться прев’ю PDF.</p>
      <p v-else-if="file.previewStatus === 'pending' || file.previewStatus === 'converting'" class="hint">
        Швидка конвертація для передперегляду…
      </p>
      <p v-else-if="file.previewStatus === 'error'" class="hint">
        Не вдалося створити preview: {{ file.previewError || 'помилка' }}
      </p>

      <div class="stage" :style="stageStyle">
        <canvas ref="canvas" class="page-canvas" v-show="hasPdf" />
        <div v-if="!hasPdf" class="blank-page" />

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
import { computed, ref, watch, onBeforeUnmount, nextTick, reactive } from 'vue';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { tileGhostsFromPrimary } from '../utils/tiling.js';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

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
const displayScale = ref(0.85);
const imagePreviewUrl = ref(null);
const active = ref(null);
const hasPdf = ref(false);
const handles = ['nw', 'ne', 'sw', 'se'];

const wm = reactive(structuredClone(props.watermark));

let pdfDoc = null;
let drag = null;
let syncingFromParent = false;

watch(
  () => props.watermark,
  (v) => {
    if (drag) return;
    syncingFromParent = true;
    Object.assign(wm.text, structuredClone(v.text));
    Object.assign(wm.image, structuredClone(v.image));
    syncingFromParent = false;
  },
  { deep: true }
);

function commitWm() {
  if (syncingFromParent) return;
  emit('update:watermark', structuredClone(wm));
}

const stageStyle = computed(() => ({
  width: `${Math.max(120, pageSize.value.w * displayScale.value)}px`,
  height: `${Math.max(160, pageSize.value.h * displayScale.value)}px`
}));

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
    fontFamily: wm.text.fontFamily?.includes('Times')
      ? 'Times New Roman, Times, serif'
      : wm.text.fontFamily?.includes('Courier')
        ? 'Courier New, monospace'
        : 'Helvetica, Arial, sans-serif',
    fontWeight: wm.text.fontFamily?.includes('Bold') ? '700' : '400',
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
  const maxW = wrap.value?.clientWidth ? wrap.value.clientWidth - 32 : 560;
  const maxH = wrap.value?.clientHeight ? wrap.value.clientHeight - 48 : 640;
  displayScale.value = Math.min(maxW / w, maxH / h, 1.25);
}

function resetBlank() {
  hasPdf.value = false;
  pageCount.value = 0;
  page.value = 1;
  pageSize.value = { w: 595.28, h: 841.89 };
  nextTick(() => fitScale(pageSize.value.w, pageSize.value.h));
}

async function loadPreview() {
  cleanupPdf();
  if (!props.file?.previewUrl) {
    resetBlank();
    return;
  }
  try {
    const res = await fetch(props.file.previewUrl);
    if (!res.ok) throw new Error('preview fetch failed');
    const data = await res.arrayBuffer();
    pdfDoc = await pdfjs.getDocument({ data }).promise;
    pageCount.value = pdfDoc.numPages;
    page.value = 1;
    hasPdf.value = true;
    await nextTick();
    await renderPage();
  } catch (err) {
    console.error(err);
    resetBlank();
  }
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
  () => [props.file?.id, props.file?.previewUrl, props.file?.previewStatus],
  () => loadPreview(),
  { immediate: true }
);

watch(page, () => {
  if (pdfDoc) renderPage();
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
  if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value);
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
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.title {
  font-size: 0.95rem;
  font-weight: 600;
}

.pager {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}

.hint {
  margin: 0 0 8px;
  font-size: 0.8rem;
  color: var(--muted);
  text-align: center;
  width: 100%;
}

.stage-wrap {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  background: #e8e8e4;
  min-height: 360px;
}

.stage {
  position: relative;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  flex-shrink: 0;
}

.blank-page {
  position: absolute;
  inset: 0;
  background: #fff;
}

.page-canvas {
  display: block;
  width: 100%;
  height: 100%;
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
