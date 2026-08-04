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

    <div v-if="!file" class="empty">Оберіть файл у списку мініатюр</div>
    <div v-else-if="!canShow" class="empty">Неможливо показати передперегляд для цього типу файлу</div>
    <div v-else class="stage-wrap" ref="wrap">
      <div
        class="stage"
        :style="stageStyle"
        @pointerdown="onStageDown"
      >
        <canvas v-show="isPdf" ref="canvas" class="page-canvas" />
        <img
          v-if="isImage && objectUrl"
          :src="objectUrl"
          class="page-image"
          :style="imageFilter"
          alt=""
          @load="onImageLoad"
        />

        <!-- Image watermark overlay -->
        <template v-if="watermark.image.enabled && imagePreviewUrl">
          <div
            v-for="(pos, idx) in imagePositions"
            :key="'img-' + idx"
            class="wm wm-image"
            :class="{ active: activeHandle === 'image' && idx === 0 }"
            :style="wmBoxStyle(pos, watermark.image, 'image')"
            @pointerdown.stop="startDrag($event, 'image', idx)"
          >
            <img :src="imagePreviewUrl" alt="" :style="wmImageStyle" />
            <template v-if="idx === 0 && watermark.image.pattern === 'single'">
              <span
                v-for="h in handles"
                :key="h"
                class="handle"
                :data-handle="h"
                @pointerdown.stop="startResize($event, 'image', h)"
              />
            </template>
          </div>
        </template>

        <!-- Text watermark overlay -->
        <template v-if="watermark.text.enabled">
          <div
            v-for="(pos, idx) in textPositions"
            :key="'txt-' + idx"
            class="wm wm-text"
            :class="{ active: activeHandle === 'text' && idx === 0 }"
            :style="wmTextStyle(pos, idx)"
            @pointerdown.stop="startDrag($event, 'text', idx)"
          >
            <span class="wm-label">{{ watermark.text.value }}</span>
            <template v-if="idx === 0 && watermark.text.pattern === 'single'">
              <span
                v-for="h in handles"
                :key="h"
                class="handle"
                :data-handle="h"
                @pointerdown.stop="startResize($event, 'text', h)"
              />
            </template>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount, nextTick } from 'vue';
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
const pageSize = ref({ w: 595, h: 842 });
const displayScale = ref(1);
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
  width: `${pageSize.value.w * displayScale.value}px`,
  height: `${pageSize.value.h * displayScale.value}px`
}));

const imageFilter = computed(() =>
  props.watermark.image.grayscale ? { filter: 'grayscale(1)' } : {}
);

const wmImageStyle = computed(() => ({
  opacity: props.watermark.image.opacity,
  filter: props.watermark.image.grayscale ? 'grayscale(1)' : 'none',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  pointerEvents: 'none'
}));

function patternPositions(pattern, stageW, stageH, boxW, boxH, xPct, yPct) {
  if (pattern === 'single' || !pattern) {
    return [{
      left: stageW * xPct - boxW / 2,
      top: stageH * yPct - boxH / 2,
      w: boxW,
      h: boxH
    }];
  }
  const stepX = Math.max(boxW * 1.4, 80);
  const stepY = Math.max(boxH * 1.4, 80);
  const positions = [];
  if (pattern === 'diagonal') {
    for (let y = -stepY; y < stageH + stepY; y += stepY) {
      for (let x = -stepX; x < stageW + stepX; x += stepX) {
        positions.push({
          left: x + ((Math.floor(y / stepY) % 2) * stepX) / 2,
          top: y,
          w: boxW,
          h: boxH
        });
      }
    }
    return positions;
  }
  for (let y = 0; y < stageH; y += stepY) {
    for (let x = 0; x < stageW; x += stepX) {
      positions.push({ left: x, top: y, w: boxW, h: boxH });
    }
  }
  return positions;
}

const stageW = computed(() => pageSize.value.w * displayScale.value);
const stageH = computed(() => pageSize.value.h * displayScale.value);

const textPositions = computed(() => {
  const t = props.watermark.text;
  const fontPx = (t.fontSizePt || 48) * displayScale.value * (96 / 72);
  const approxW = Math.max(40, (t.value?.length || 1) * fontPx * 0.55);
  const approxH = fontPx * 1.2;
  return patternPositions(
    t.pattern,
    stageW.value,
    stageH.value,
    approxW,
    approxH,
    t.transform.xPct,
    t.transform.yPct
  );
});

const imagePositions = computed(() => {
  const t = props.watermark.image;
  const w = stageW.value * (t.transform.wPct || 0.35);
  const h = w * 0.75;
  return patternPositions(
    t.pattern,
    stageW.value,
    stageH.value,
    w,
    h,
    t.transform.xPct,
    t.transform.yPct
  );
});

function wmBoxStyle(pos, layer, kind) {
  return {
    left: `${pos.left}px`,
    top: `${pos.top}px`,
    width: `${pos.w}px`,
    height: `${pos.h}px`,
    transform: `rotate(${layer.transform.rotationDeg || 0}deg)`,
    opacity: kind === 'image' ? 1 : undefined
  };
}

function wmTextStyle(pos, idx) {
  const t = props.watermark.text;
  const fontPx = (t.fontSizePt || 48) * displayScale.value * (96 / 72);
  return {
    ...wmBoxStyle(pos, t, 'text'),
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

async function loadFile() {
  cleanupPdf();
  page.value = 1;
  pageCount.value = 0;
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
    objectUrl.value = null;
  }
  if (!props.file || !canShow.value) return;

  if (isImage.value) {
    objectUrl.value = URL.createObjectURL(props.file.file);
    pageCount.value = 1;
    return;
  }

  if (isPdf.value) {
    const data = await props.file.file.arrayBuffer();
    pdfDoc = await pdfjs.getDocument({ data }).promise;
    pageCount.value = pdfDoc.numPages;
    await renderPage();
  }
}

async function renderPage() {
  if (!pdfDoc || !canvas.value) return;
  const pdfPage = await pdfDoc.getPage(page.value);
  const unscaled = pdfPage.getViewport({ scale: 1 });
  pageSize.value = { w: unscaled.width, h: unscaled.height };

  await nextTick();
  const maxW = wrap.value?.clientWidth ? wrap.value.clientWidth - 24 : 600;
  const maxH = wrap.value?.clientHeight ? wrap.value.clientHeight - 24 : 700;
  displayScale.value = Math.min(maxW / unscaled.width, maxH / unscaled.height, 1.4);

  const viewport = pdfPage.getViewport({ scale: displayScale.value });
  const c = canvas.value;
  c.width = viewport.width;
  c.height = viewport.height;
  const ctx = c.getContext('2d');
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
}

function onImageLoad(e) {
  const img = e.target;
  pageSize.value = { w: img.naturalWidth, h: img.naturalHeight };
  nextTick(() => {
    const maxW = wrap.value?.clientWidth ? wrap.value.clientWidth - 24 : 600;
    const maxH = wrap.value?.clientHeight ? wrap.value.clientHeight - 24 : 700;
    displayScale.value = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1.4);
  });
}

function cleanupPdf() {
  if (pdfDoc) {
    pdfDoc.destroy();
    pdfDoc = null;
  }
}

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

function startDrag(e, kind, idx) {
  if (idx !== 0) return;
  if (props.watermark[kind].pattern !== 'single') return;
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

  if (dragState.mode === 'drag') {
    patchWatermark((wm) => {
      wm[dragState.kind].transform.xPct = clamp(dragState.origX + dx / sw, 0, 1);
      wm[dragState.kind].transform.yPct = clamp(dragState.origY + dy / sh, 0, 1);
    });
    return;
  }

  // resize
  const shift = e.shiftKey || dragState.shift;
  const alt = e.altKey || dragState.alt;
  const signX = dragState.handle.includes('e') ? 1 : -1;
  const delta = (dx * signX) / sw;

  patchWatermark((wm) => {
    if (dragState.kind === 'image') {
      let nextW = clamp(dragState.origW + delta, 0.05, 1);
      if (shift) {
        // proportional already via wPct only (aspect locked in render)
        nextW = clamp(dragState.origW + delta, 0.05, 1);
      }
      wm.image.transform.wPct = nextW;
      if (alt) {
        // keep center: x/y unchanged
      } else {
        const dw = nextW - dragState.origW;
        if (dragState.handle.includes('e')) {
          wm.image.transform.xPct = clamp(dragState.origX + dw / 2, 0, 1);
        } else if (dragState.handle.includes('w')) {
          wm.image.transform.xPct = clamp(dragState.origX - dw / 2, 0, 1);
        }
      }
    } else {
      const fontDelta = (dx * signX) * 0.15;
      let next = clamp(Math.round(dragState.origW + fontDelta), 6, 200);
      if (shift) {
        // same — font size is scalar
      }
      wm.text.fontSizePt = next;
      if (!alt) {
        // slight position nudge optional — keep center when alt
      }
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

.empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--muted);
  padding: 24px;
  text-align: center;
}

.stage-wrap {
  flex: 1;
  overflow: auto;
  display: grid;
  place-items: center;
  padding: 12px;
  background: #e8e8e4;
  min-height: 360px;
}

.stage {
  position: relative;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  overflow: hidden;
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
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: move;
  user-select: none;
  border: 1px dashed transparent;

  &.active {
    border-color: var(--accent);
  }
}

.wm-text .wm-label {
  white-space: nowrap;
  pointer-events: none;
}

.wm-image img {
  pointer-events: none;
}

.handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: var(--accent);
  border: 1px solid #fff;
  border-radius: 1px;

  &[data-handle='nw'] { left: -5px; top: -5px; cursor: nwse-resize; }
  &[data-handle='ne'] { right: -5px; top: -5px; cursor: nesw-resize; }
  &[data-handle='sw'] { left: -5px; bottom: -5px; cursor: nesw-resize; }
  &[data-handle='se'] { right: -5px; bottom: -5px; cursor: nwse-resize; }
}
</style>
