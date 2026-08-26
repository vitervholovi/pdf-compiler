<template>
  <div class="app-shell">
    <header class="top">
      <div class="header-left">
        <a href="/temecriack/auth/menu/" class="brand-link">
          <h1><span class="brand-mark">🦆</span> TeMeCriack</h1>
        </a>
        <nav class="app-nav" aria-label="Сервіси TeMeCriack">
          <a
            v-for="item in navItems"
            :key="item.key"
            :href="item.href"
            class="app-nav__link"
            :class="{ 'app-nav__link--active': item.active }"
            :aria-current="item.active ? 'page' : undefined"
            rel="noopener"
          >
            <span aria-hidden="true" v-html="item.icon" />
            <span>{{ item.label }}</span>
          </a>
        </nav>
        <p class="subtitle">Документи, watermark і конвертація в PDF</p>
      </div>
      <div class="top-actions">
        <span v-if="convertingCount" class="wait-hint">
          Preview: {{ convertingCount }}…
        </span>
        <button
          type="button"
          class="btn btn-icon"
          :disabled="busy"
          title="Зберегти налаштування"
          aria-label="Зберегти налаштування"
          @click="saveWatermarkSettings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
        </button>
        <button
          type="button"
          class="btn btn-icon"
          :disabled="busy"
          title="Завантажити налаштування"
          aria-label="Завантажити налаштування"
          @click="triggerLoadWatermark"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
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
        :key="selectedFile?.id || 'none'"
        :file="selectedFile"
        v-model:watermark="watermark"
        :watermark-image-file="watermarkImageFile"
        :edit-orientation="orientationMode === 'auto' ? null : orientationMode"
        @update:pageOrientation="onPageOrientation"
        @update:pageLocked="pageLocked = $event"
      />
    </div>

    <div class="bottom-bar" ref="bottomBar">
      <div class="convert-row">
        <div class="wm-io">
          <div class="ori-switch" role="group" aria-label="Орієнтація налаштувань">
            <span class="ori-label">Орієнтація:</span>
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
              :disabled="pageLocked && pageOrientation === 'landscape'"
              :title="
                pageLocked && pageOrientation === 'landscape'
                  ? 'Поточна сторінка альбомна — книжкові налаштування недоступні'
                  : undefined
              "
              @click="orientationMode = 'portrait'"
            >
              Книжкова
            </button>
            <button
              type="button"
              class="btn"
              :class="{ active: orientationMode === 'landscape' }"
              :disabled="pageLocked && pageOrientation === 'portrait'"
              :title="
                pageLocked && pageOrientation === 'portrait'
                  ? 'Поточна сторінка книжкова — альбомні налаштування недоступні'
                  : undefined
              "
              @click="orientationMode = 'landscape'"
            >
              Альбомна
            </button>
          </div>
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
import { computed, nextTick, ref, watch, onMounted } from 'vue';
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
import {
  saveWatermarkToStorage,
  loadWatermarkFromStorage
} from './utils/watermarkStorage.js';
import { apiFetch, apiUrl } from './utils/api.js';
import { buildAppNavItems } from './utils/appNav.js';

/** Cross-app nav — PDF Compiler first; rest keep Links → Chats → Stats. */
const navItems = buildAppNavItems(
  typeof window !== 'undefined' && window.location.pathname && window.location.pathname !== '/'
    ? window.location.pathname
    : '/temecriack/pdf-compiler/',
);

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
/** True when preview shows a real PDF/image page (lock opposite ori button). */
const pageLocked = ref(false);
let es = null;
/** Skip persisting until initial localStorage hydrate finishes */
let storageReady = false;
let persistTimer = null;

const editOrientation = computed(() =>
  orientationMode.value === 'auto' ? pageOrientation.value : orientationMode.value
);

function onPageOrientation(ori) {
  pageOrientation.value = ori === 'landscape' ? 'landscape' : 'portrait';
  // If opposite mode was selected but page is locked, fall back to auto
  if (pageLocked.value) {
    if (orientationMode.value === 'portrait' && pageOrientation.value === 'landscape') {
      orientationMode.value = 'auto';
    }
    if (orientationMode.value === 'landscape' && pageOrientation.value === 'portrait') {
      orientationMode.value = 'auto';
    }
  }
}

function applyWatermarkState(loaded, imageFile) {
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
}

async function persistWatermark() {
  if (!storageReady) return;
  try {
    await saveWatermarkToStorage(watermark.value, watermarkImageFile.value);
  } catch {
    /* quota / private mode — ignore */
  }
}

function schedulePersist() {
  if (!storageReady) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistWatermark();
  }, 400);
}

watch([watermark, watermarkImageFile], () => schedulePersist(), { deep: true });

onMounted(async () => {
  try {
    const stored = await loadWatermarkFromStorage();
    if (stored?.watermark) {
      applyWatermarkState(stored.watermark, stored.imageFile);
    }
  } finally {
    storageReady = true;
  }
});

async function saveWatermarkSettings() {
  wmIoError.value = '';
  try {
    const payload = await buildWatermarkExport(watermark.value, watermarkImageFile.value);
    downloadWatermarkJson(payload);
    await saveWatermarkToStorage(watermark.value, watermarkImageFile.value);
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
    applyWatermarkState(loaded, imageFile);
    await saveWatermarkToStorage(watermark.value, watermarkImageFile.value);
  } catch (err) {
    wmIoError.value = err.message || String(err);
  }
}

const selectedFile = computed(() => files.value.find((f) => f.id === selectedId.value) || null);

const convertingCount = computed(() =>
  files.value.filter((f) => f.previewStatus === 'converting' || f.previewStatus === 'pending').length
);

async function requestQuickPreview(entry) {
  const mark = (partial) => {
    const i = files.value.findIndex((x) => x.id === entry.id);
    if (i < 0) return;
    // Replace object so Vue always notifies DocumentPreview
    files.value[i] = { ...files.value[i], ...partial };
    Object.assign(entry, files.value[i]);
  };

  mark({ previewStatus: 'converting', previewEpoch: Date.now() });
  const fd = new FormData();
  fd.append('file', entry.file, entry.file.name);
  try {
    const res = await apiFetch('api/preview', { method: 'POST', body: fd });
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
    // Cache before flipping to ready — preview load then finds bytes immediately
    await cacheServerPreview(entry.id, data.url);
    mark({
      previewId: data.previewId,
      previewUrl: data.url,
      previewKind: 'server-pdf',
      previewStatus: 'ready',
      previewEpoch: Date.now()
    });
  } catch (e) {
    mark({
      previewStatus: 'error',
      previewError: e.message || String(e),
      previewKind: 'blank',
      previewEpoch: Date.now()
    });
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
    previewError: null,
    previewEpoch: 0
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
      apiFetch(`api/preview/${removed.previewId}`, { method: 'DELETE' }).catch(() => {});
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
    const res = await apiFetch('api/jobs', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Помилка запуску');
    }
    const { jobId } = await res.json();
    // EventSource cannot set Authorization; authLite accepts the SSO cookie (Path=/).
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
