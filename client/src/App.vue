<template>
  <div class="app-shell">
    <header class="top">
      <div class="titles">
        <h1>PDF Compiler</h1>
        <p class="subtitle">Документи, watermark і конвертація в PDF</p>
      </div>
      <span v-if="convertingCount" class="wait-hint">
        Preview: {{ convertingCount }}…
      </span>
    </header>

    <FileUploadZone
      class="upload"
      :files="files"
      :selected-id="selectedId"
      @add="onAdd"
      @remove="onRemove"
      @select="selectedId = $event"
    />

    <div class="workspace">
      <TextWatermarkSettings v-model="watermark" :orientation="editOrientation" />
      <ImageWatermarkSettings
        v-model="watermark"
        v-model:watermark-image-file="watermarkImageFile"
        :orientation="editOrientation"
      />
      <DocumentPreview
        :file="selectedFile"
        v-model:watermark="watermark"
        :watermark-image-file="watermarkImageFile"
        :edit-orientation="orientationMode === 'auto' ? null : orientationMode"
        @update:pageOrientation="onPageOrientation"
      />
    </div>

    <div class="bottom-bar" ref="bottomBar">
      <div class="convert-row">
        <div class="wm-io">
          <div class="ori-switch" role="group" aria-label="Орієнтація налаштувань">
            <span class="ori-label">Позиція WM:</span>
            <button
              type="button"
              class="btn"
              :class="{ active: orientationMode === 'auto' }"
              @click="orientationMode = 'auto'"
            >
              Авто ({{ pageOrientation === 'landscape' ? 'альбом' : 'книга' }})
            </button>
            <button
              type="button"
              class="btn"
              :class="{ active: orientationMode === 'portrait' }"
              @click="orientationMode = 'portrait'"
            >
              Книжкова
            </button>
            <button
              type="button"
              class="btn"
              :class="{ active: orientationMode === 'landscape' }"
              @click="orientationMode = 'landscape'"
            >
              Альбомна
            </button>
          </div>
          <button type="button" class="btn" :disabled="busy" @click="saveWatermarkSettings">
            Зберегти watermark
          </button>
          <button type="button" class="btn" :disabled="busy" @click="triggerLoadWatermark">
            Завантажити watermark
          </button>
          <input
            ref="wmImportInput"
            type="file"
            accept="application/json,.json"
            class="sr-only"
            @change="onLoadWatermark"
          />
          <span v-if="wmIoError" class="wm-io-error">{{ wmIoError }}</span>
        </div>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!files.length || busy"
          @click="startJob"
        >
          {{ busy ? 'Обробка…' : 'Перетворити' }}
        </button>
      </div>
      <JobProgress class="progress-slot" :events="events" :download-url="downloadUrl" />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';
import FileUploadZone from './components/FileUploadZone.vue';
import TextWatermarkSettings from './components/TextWatermarkSettings.vue';
import ImageWatermarkSettings from './components/ImageWatermarkSettings.vue';
import DocumentPreview from './components/DocumentPreview.vue';
import JobProgress from './components/JobProgress.vue';
import {
  defaultWatermark,
  normalizeWatermark,
  isPdfFile,
  isImageFile,
  needsServerPreview
} from './utils/files.js';
import {
  cacheServerPreview,
  cacheLocalPdf,
  cacheLocalImage,
  releasePreviewCache
} from './utils/previewCache.js';
import {
  buildWatermarkExport,
  downloadWatermarkJson,
  parseWatermarkImport
} from './utils/watermarkIo.js';
import { apiUrl } from './utils/api.js';

const files = ref([]);
const selectedId = ref(null);
const watermark = ref(normalizeWatermark(defaultWatermark()));
const watermarkImageFile = ref(null);
const events = ref([]);
const downloadUrl = ref(null);
const busy = ref(false);
const bottomBar = ref(null);
const wmImportInput = ref(null);
const wmIoError = ref('');
/** 'auto' | 'portrait' | 'landscape' */
const orientationMode = ref('auto');
const pageOrientation = ref('portrait');
let es = null;

const editOrientation = computed(() =>
  orientationMode.value === 'auto' ? pageOrientation.value : orientationMode.value
);

function onPageOrientation(ori) {
  pageOrientation.value = ori === 'landscape' ? 'landscape' : 'portrait';
}

async function saveWatermarkSettings() {
  wmIoError.value = '';
  try {
    const payload = await buildWatermarkExport(watermark.value, watermarkImageFile.value);
    downloadWatermarkJson(payload);
  } catch (e) {
    wmIoError.value = e.message || String(e);
  }
}

function triggerLoadWatermark() {
  wmIoError.value = '';
  wmImportInput.value?.click();
}

async function onLoadWatermark(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  wmIoError.value = '';
  try {
    const { watermark: loaded, imageFile } = await parseWatermarkImport(file);
    watermark.value = normalizeWatermark(loaded);
    if (imageFile) {
      watermarkImageFile.value = imageFile;
      if (!watermark.value.image.enabled) {
        watermark.value = {
          ...watermark.value,
          image: { ...watermark.value.image, enabled: true }
        };
      }
    }
  } catch (err) {
    wmIoError.value = err.message || String(err);
  }
}

const selectedFile = computed(() => files.value.find((f) => f.id === selectedId.value) || null);

const convertingCount = computed(() =>
  files.value.filter((f) => f.previewStatus === 'converting' || f.previewStatus === 'pending').length
);

async function requestQuickPreview(entry) {
  entry.previewStatus = 'converting';
  const fd = new FormData();
  fd.append('file', entry.file, entry.file.name);
  try {
    const res = await fetch(apiUrl('api/preview'), { method: 'POST', body: fd });
    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { error: raw.slice(0, 200) };
    }
    if (!res.ok) {
      throw new Error(data.error || `Preview HTTP ${res.status}`);
    }
    entry.previewId = data.previewId;
    entry.previewUrl = data.url;
    entry.previewKind = 'server-pdf';
    entry.previewStatus = 'ready';
    // Cache PDF bytes immediately — survives file switching and post-job server cleanup
    await cacheServerPreview(entry.id, data.url);
  } catch (e) {
    entry.previewStatus = 'error';
    entry.previewError = e.message || String(e);
    entry.previewKind = 'blank';
  }
}

/** Queue client-side preview uploads so LibreOffice is not hammered. */
let previewQueue = Promise.resolve();
function enqueuePreview(entry) {
  previewQueue = previewQueue.then(() => requestQuickPreview(entry)).catch(() => {});
  return previewQueue;
}

function makeEntry(file) {
  const entry = {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
    file,
    previewId: null,
    previewUrl: null,
    previewKind: 'blank',
    previewStatus: 'ready',
    previewError: null
  };

  if (isPdfFile(file.name)) {
    entry.previewKind = 'local-pdf';
    entry.previewStatus = 'ready';
    // Warm cache in background
    cacheLocalPdf(entry.id, file).catch(() => {});
  } else if (isImageFile(file.name)) {
    entry.previewKind = 'local-image';
    entry.previewStatus = 'ready';
    cacheLocalImage(entry.id, file);
  } else if (needsServerPreview(file.name)) {
    entry.previewKind = 'blank';
    entry.previewStatus = 'converting';
  } else {
    entry.previewKind = 'blank';
    entry.previewStatus = 'unsupported';
  }

  return entry;
}

function onAdd(list) {
  const added = list.map(makeEntry);
  files.value.push(...added);
  if (!selectedId.value && added[0]) selectedId.value = added[0].id;
  for (const entry of added) {
    if (entry.previewStatus === 'converting') {
      enqueuePreview(entry);
    }
  }
}

async function onRemove(i) {
  const removed = files.value.splice(i, 1)[0];
  if (removed) {
    releasePreviewCache(removed.id);
    if (removed.previewId) {
      fetch(apiUrl(`api/preview/${removed.previewId}`), { method: 'DELETE' }).catch(() => {});
    }
  }
  if (removed && removed.id === selectedId.value) {
    selectedId.value = files.value[0]?.id || null;
  }
}

function scrollToProgress() {
  nextTick(() => {
    bottomBar.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

async function startJob() {
  if (!files.value.length || busy.value) return;
  busy.value = true;
  events.value = [];
  downloadUrl.value = null;
  if (es) {
    es.close();
    es = null;
  }
  scrollToProgress();

  const fd = new FormData();
  const previewIds = [];
  for (const f of files.value) {
    fd.append('files', f.file, f.file.name);
    previewIds.push(f.previewId || null);
  }
  fd.append('previewIds', JSON.stringify(previewIds));
  fd.append('watermark', JSON.stringify(watermark.value));
  if (watermark.value.image.enabled && watermarkImageFile.value) {
    fd.append('watermarkImage', watermarkImageFile.value);
  }

  try {
    const res = await fetch(apiUrl('api/jobs'), { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Помилка запуску');
    }
    const { jobId } = await res.json();
    es = new EventSource(apiUrl(`api/jobs/${jobId}/events`));
    es.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === 'end') {
        es.close();
        es = null;
        busy.value = false;
        return;
      }
      events.value.push(data);
      scrollToProgress();
      if (data.downloadUrl) downloadUrl.value = data.downloadUrl;
      if (data.type === 'completed') {
        // Server may delete temp preview files — keep client cache & UI state
        for (const f of files.value) {
          if (f.previewId) {
            f.previewId = null;
            f.previewUrl = null;
          }
        }
        busy.value = false;
      }
      if (data.type === 'failed') {
        busy.value = false;
      }
    };
    es.onerror = () => {
      busy.value = false;
    };
  } catch (e) {
    events.value.push({ type: 'failed', message: e.message });
    busy.value = false;
  }
}
</script>
