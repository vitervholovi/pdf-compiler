<template>
  <section class="preview panel">
    <div class="toolbar">
      <span class="title">Передперегляд</span>
      <div v-if="canShow && pageCount > 0" class="pager">
        <button type="button" class="btn" :disabled="page <= 1" @click="page--">←</button>
        <span>{{ page }} / {{ pageCount }}</span>
        <button type="button" class="btn" :disabled="page >= pageCount" @click="page++">→</button>
      </div>
    </div>

    <div class="stage-wrap" ref="wrap">
      <p v-if="!file" class="hint">Порожня сторінка A4 — налаштуйте watermark. Оберіть PDF/зображення для точного прев’ю.</p>
      <p v-else-if="!canShow" class="hint">Неможливо показати вміст цього файлу — watermark на порожній сторінці.</p>

      <div class="stage" :style="stageStyle" @pointerdown="onStageDown">
        <canvas v-show="isPdf && canShow" ref="canvas" class="page-canvas" />
        <img
          v-if="isImage && canShow && objectUrl"
          :src="objectUrl"
          class="page-image"
          alt=""
          @load="onImageLoad"
        />
        <div v-else-if="!canShow || !file" class="blank-page" />

        <!-- Ghost tiles (non-interactive) -->
        <template v-if="watermark.text.enabled">
          <div
            v-for="(pos, idx) in textGhosts"
            :key="'tg-' + idx"
            class="wm wm-text ghost"
            :style="wmTextStyle(pos)"
          >
            <span class="wm-label">{{ watermark.text.value }}</span>
          </div>
        </template>
        <template v-if="watermark.image.enabled && imagePreviewUrl">
          <div
            v-for="(pos, idx) in imageGhosts"
            :key="'ig-' + idx"
            class="wm wm-image ghost"
            :style="wmBoxStyle(pos, watermark.image)"
          >
            <img :src="imagePreviewUrl" alt="" :style="wmImageStyle" />
          </div>
        </template>

        <!-- Primary interactive text -->
        <div
          v-if="watermark.text.enabled"
          class="wm wm-text primary"
          :class="{ active: activeHandle === 'text' }"
          :style="wmTextStyle(textPrimary)"
          @pointerdown.stop="startDrag($event, 'text')"
        >
          <span class="wm-label">{{ watermark.text.value || ' ' }}</span>
          <span
            v-for="h in handles"
            :key="'th-' + h"
            class="handle"
            :data-handle="h"
            @pointerdown.stop="startResize($event, 'text', h)"
          />
        </div>

        <!-- Primary interactive image -->
        <div
          v-if="watermark.image.enabled && imagePreviewUrl"
          class="wm wm-image primary"
          :class="{ active: activeHandle === 'image' }"
          :style="wmBoxStyle(imagePrimary, watermark.image)"
          @pointerdown.stop="startDrag($event, 'image')"
        >
          <img :src="imagePreviewUrl" alt="" :style="wmImageStyle" />
          <span
            v-for="h in handles"
            :key="'ih-' + h"
            class="handle"
            :data-handle="h"
            @pointerdown.stop="startResize($event, 'image', h)"
          />
        </div>
        <div
          v-else-if="watermark.image.enabled && !imagePreviewUrl"
          class="wm-placeholder"
        >
          Оберіть зображення watermark зліва
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount, nextTick, onMounted } from 'vue';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { canPreviewClient, isImageFile, isPdfFile } from '../utils/files.js';

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
const objectUrl = ref(null);
const imagePreviewUrl = ref(null);
const activeHandle = ref(null);
const handles = ['nw', 'ne', 'sw', 'se'];

let pdfDoc = null;
let dragState = null;

const canShow = computed(() => props.file && canPreviewClient(props.file.file.name));
const isPdf = computed(() => props.file && isPdfFile(props.file.file.name));
const isImage = computed(() => props.file && isImageFile(props.file.file.name));

const stageStyle = computed(() => ({
  width: `${Math.max(120, pageSize.value.w * displayScale.value)}px`,
  height: `${Math.max(160, pageSize.value.h * displayScale.value)}px`
}));

const wmImageStyle = computed(() => ({
  opacity: props.watermark.image.opacity,
  filter: props.watermark.image.grayscale ? 'grayscale(1)' : 'none',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  pointerEvents: 'none'
}));

function patternGhosts(pattern, stageW, stageH, boxW, boxH, xPct, yPct) {
  if (pattern === 'single' || !pattern) return [];
  const stepX = Math.max(boxW * 1.4, 80);
  const stepY = Math.max(boxH * 1.4, 80);
  const positions = [];
  const primaryLeft = stageW * xPct - boxW / 2;
  const primaryTop = stageH * yPct - boxH / 2;

  const push = (left, top) => {
    if (Math.abs(left - primaryLeft) < 2 && Math.abs(top - primaryTop) < 2) return;
    positions.push({ left, top, w: boxW, h: boxH });
  };

  if (pattern === 'diagonal') {
    for (let y = -stepY; y < stageH + stepY; y += stepY) {
      for (let x = -stepX; x < stageW + stepX; x += stepX) {
        push(x + ((Math.floor(y / stepY) % 2) * stepX) / 2, y);
      }
    }
    return positions;
  }
  for (let y = 0; y < stageH; y += stepY) {
    for (let x = 0; x < stageW; x += stepX) {
      push(x, y);
    }
  }
  return positions;
}

const stageW = computed(() => pageSize.value.w * displayScale.value);
const stageH = computed(() => pageSize.value.h * displayScale.value);

function textBoxSize() {
  const t = props.watermark.text;
  const fontPx = (t.fontSizePt || 48) * displayScale.value * (96 / 72);
  return {
    w: Math.max(48, (t.value?.length || 1) * fontPx * 0.55),
    h: Math.max(24, fontPx * 1.25),
    fontPx
  };
}

function imageBoxSize() {
  const t = props.watermark.image;
  const w = stageW.value * (t.transform.wPct || 0.35);
  return { w, h: w * 0.75 };
}

const textPrimary = computed(() => {
  const { w, h } = textBoxSize();
  const t = props.watermark.text.transform;
  return {
    left: stageW.value * t.xPct - w / 2,
    top: stageH.value * t.yPct - h / 2,
    w,
    h
  };
});

const imagePrimary = computed(() => {
  const { w, h } = imageBoxSize();
  const t = props.watermark.image.transform;
  return {
    left: stageW.value * t.xPct - w / 2,
    top: stageH.value * t.yPct - h / 2,
    w,
    h
  };
});

const textGhosts = computed(() => {
  const { w, h } = textBoxSize();
  const t = props.watermark.text;
  return patternGhosts(t.pattern, stageW.value, stageH.value, w, h, t.transform.xPct, t.transform.yPct);
});

const imageGhosts = computed(() => {
  const { w, h } = imageBoxSize();
  const t = props.watermark.image;
  return patternGhosts(t.pattern, stageW.value, stageH.value, w, h, t.transform.xPct, t.transform.yPct);
});

function wmBoxStyle(pos, layer) {
  return {
    left: `${pos.left}px`,
    top: `${pos.top}px`,
    width: `${pos.w}px`,
    height: `${pos.h}px`,
    transform: `rotate(${layer.transform.rotationDeg || 0}deg)`
  };
}

function wmTextStyle(pos) {
  const t = props.watermark.text;
  const { fontPx } = textBoxSize();
  return {
    ...wmBoxStyle(pos, t),
    color: t.color,
    opacity: t.opacity,
    fontSize: `${fontPx}px`,
    fontFamily: t.fontFamily?.includes('Times')
      ? 'Times New Roman, Times, serif'
      : t.fontFamily?.includes('Courier')
        ? 'Courier New, monospace'
        : 'Helvetica, Arial, sans-serif',
    fontWeight: t.fontFamily?.includes('Bold') ? '700' : '400'
  };
}

function patchWatermark(mutator) {
  const next = structuredClone(props.watermark);
  mutator(next);
  emit('update:watermark', next);
}

function fitScale(w, h) {
  const maxW = wrap.value?.clientWidth ? wrap.value.clientWidth - 32 : 560;
  const maxH = wrap.value?.clientHeight ? wrap.value.clientHeight - 48 : 640;
  displayScale.value = Math.min(maxW / w, maxH / h, 1.25);
}

function resetBlankPage() {
  pageSize.value = { w: 595.28, h: 841.89 };
  pageCount.value = 0;
  nextTick(() => fitScale(pageSize.value.w, pageSize.value.h));
}

async function loadFile() {
  cleanupPdf();
  page.value = 1;
  pageCount.value = 0;
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
    objectUrl.value = null;
  }
  if (!props.file || !canShow.value) {
    resetBlankPage();
    return;
  }

  if (isImage.value) {
    objectUrl.value = URL.createObjectURL(props.file.file);
    pageCount.value = 1;
    return;
  }

  if (isPdf.value) {
    const data = await props.file.file.arrayBuffer();
    pdfDoc = await pdfjs.getDocument({ data }).promise;
    pageCount.value = pdfDoc.numPages;
    await nextTick();
    await renderPage();
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

function onImageLoad(e) {
  const img = e.target;
  pageSize.value = { w: img.naturalWidth || 595, h: img.naturalHeight || 842 };
  nextTick(() => fitScale(pageSize.value.w, pageSize.value.h));
}

function cleanupPdf() {
  if (pdfDoc) {
    pdfDoc.destroy();
    pdfDoc = null;
  }
}

onMounted(() => resetBlankPage());
watch(() => props.file, loadFile, { immediate: true });
watch(page, () => {
  if (isPdf.value) renderPage();
});

watch(
  () => props.watermarkImageFile,
  (f) => {
    if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value);
    imagePreviewUrl.value = f ? URL.createObjectURL(f) : null;
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  cleanupPdf();
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
  if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value);
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
});

function startDrag(e, kind) {
  e.preventDefault();
  activeHandle.value = kind;
  const t = props.watermark[kind].transform;
  dragState = {
    mode: 'drag',
    kind,
    startX: e.clientX,
    startY: e.clientY,
    origX: t.xPct,
    origY: t.yPct
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function startResize(e, kind, handle) {
  e.preventDefault();
  activeHandle.value = kind;
  const t = props.watermark[kind].transform;
  dragState = {
    mode: 'resize',
    kind,
    handle,
    startX: e.clientX,
    startY: e.clientY,
    origW: kind === 'image' ? t.wPct : props.watermark.text.fontSizePt,
    origX: t.xPct,
    origY: t.yPct,
    shift: e.shiftKey,
    alt: e.altKey
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function onStageDown() {
  activeHandle.value = null;
}

function onPointerMove(e) {
  if (!dragState) return;
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  const sw = stageW.value || 1;
  const sh = stageH.value || 1;
  const alt = e.altKey || dragState.alt;

  if (dragState.mode === 'drag') {
    patchWatermark((wm) => {
      wm[dragState.kind].transform.xPct = clamp(dragState.origX + dx / sw, 0.02, 0.98);
      wm[dragState.kind].transform.yPct = clamp(dragState.origY + dy / sh, 0.02, 0.98);
    });
    return;
  }

  const signX = dragState.handle.includes('e') ? 1 : -1;
  const delta = (dx * signX) / sw;

  patchWatermark((wm) => {
    if (dragState.kind === 'image') {
      const nextW = clamp(dragState.origW + delta, 0.05, 1);
      wm.image.transform.wPct = nextW;
      if (!alt) {
        const dw = nextW - dragState.origW;
        if (dragState.handle.includes('e')) {
          wm.image.transform.xPct = clamp(dragState.origX + dw / 2, 0.02, 0.98);
        } else if (dragState.handle.includes('w')) {
          wm.image.transform.xPct = clamp(dragState.origX - dw / 2, 0.02, 0.98);
        }
      }
    } else {
      const fontDelta = dx * signX * 0.2;
      wm.text.fontSizePt = clamp(Math.round(dragState.origW + fontDelta), 6, 200);
    }
  });
}

function onPointerUp() {
  dragState = null;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}
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
  overflow: visible;
  flex-shrink: 0;
}

.blank-page {
  position: absolute;
  inset: 0;
  background: #fff;
}

.page-canvas,
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
  cursor: move;
  user-select: none;
  border: 1px dashed transparent;
  box-sizing: border-box;
  touch-action: none;

  &.ghost {
    z-index: 1;
    pointer-events: none;
    border: none;
  }

  &.primary {
    z-index: 5;
    border-color: rgba(44, 95, 74, 0.45);
  }

  &.active {
    border-color: var(--accent);
    outline: 1px solid var(--accent);
  }
}

.wm-text .wm-label {
  white-space: nowrap;
  pointer-events: none;
  line-height: 1;
}

.wm-image img {
  pointer-events: none;
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
  border-radius: 1px;
  z-index: 6;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);

  &[data-handle='nw'] { left: -6px; top: -6px; cursor: nwse-resize; }
  &[data-handle='ne'] { right: -6px; top: -6px; cursor: nesw-resize; }
  &[data-handle='sw'] { left: -6px; bottom: -6px; cursor: nesw-resize; }
  &[data-handle='se'] { right: -6px; bottom: -6px; cursor: nwse-resize; }
}
</style>
