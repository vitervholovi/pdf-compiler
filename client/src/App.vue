<template>
  <div class="app-shell">
    <h1>PDF Compiler</h1>
    <p class="subtitle">Завантаження документів, watermark і конвертація в PDF</p>

    <FileUploadZone
      :files="files"
      :selected-id="selectedId"
      @add="onAdd"
      @remove="onRemove"
      @select="selectedId = $event"
    />

    <div class="workspace">
      <WatermarkSettings
        v-model="watermark"
        v-model:watermark-image-file="watermarkImageFile"
      />
      <DocumentPreview
        :file="selectedFile"
        v-model:watermark="watermark"
        :watermark-image-file="watermarkImageFile"
      />
    </div>

    <div class="actions panel">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="!files.length || busy"
        @click="startJob"
      >
        {{ busy ? 'Обробка…' : 'Перетворити' }}
      </button>
      <span v-if="convertingCount" class="wait-hint">
        Швидкий preview генерується для {{ convertingCount }} файл(ів) — watermark можна налаштовувати вже зараз
      </span>
    </div>

    <JobProgress :events="events" :download-url="downloadUrl" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import FileUploadZone from './components/FileUploadZone.vue';
import WatermarkSettings from './components/WatermarkSettings.vue';
import DocumentPreview from './components/DocumentPreview.vue';
import JobProgress from './components/JobProgress.vue';
import {
  defaultWatermark,
  isPdfFile,
  isImageFile,
  needsServerPreview
} from './utils/files.js';

const files = ref([]);
const selectedId = ref(null);
const watermark = ref(defaultWatermark());
const watermarkImageFile = ref(null);
const events = ref([]);
const downloadUrl = ref(null);
const busy = ref(false);
let es = null;

const selectedFile = computed(() => files.value.find((f) => f.id === selectedId.value) || null);

const convertingCount = computed(() =>
  files.value.filter((f) => f.previewStatus === 'converting' || f.previewStatus === 'pending').length
);

async function requestQuickPreview(entry) {
  entry.previewStatus = 'converting';
  const fd = new FormData();
  fd.append('file', entry.file, entry.file.name);
  try {
    const res = await fetch('/api/preview', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Preview failed');
    }
    const data = await res.json();
    entry.previewId = data.previewId;
    entry.previewUrl = data.url;
    entry.previewKind = 'server-pdf';
    entry.previewStatus = 'ready';
  } catch (e) {
    entry.previewStatus = 'error';
    entry.previewError = e.message;
    entry.previewKind = 'blank';
  }
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
  } else if (isImageFile(file.name)) {
    entry.previewKind = 'local-image';
    entry.previewStatus = 'ready';
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
      requestQuickPreview(entry);
    }
  }
}

async function onRemove(i) {
  const removed = files.value.splice(i, 1)[0];
  if (removed?.previewId) {
    fetch(`/api/preview/${removed.previewId}`, { method: 'DELETE' }).catch(() => {});
  }
  if (removed && removed.id === selectedId.value) {
    selectedId.value = files.value[0]?.id || null;
  }
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
    const res = await fetch('/api/jobs', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Помилка запуску');
    }
    const { jobId } = await res.json();
    es = new EventSource(`/api/jobs/${jobId}/events`);
    es.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === 'end') {
        es.close();
        es = null;
        busy.value = false;
        return;
      }
      events.value.push(data);
      if (data.downloadUrl) downloadUrl.value = data.downloadUrl;
      if (data.type === 'completed') {
        for (const f of files.value) {
          if (f.previewKind === 'server-pdf') {
            f.previewUrl = null;
            f.previewId = null;
            f.previewStatus = 'done';
            f.previewKind = 'blank';
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

<style scoped lang="scss">
.workspace {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 12px;
  margin-top: 12px;
  min-height: 520px;
  align-items: stretch;

  > :deep(.settings) {
    min-height: 520px;
    max-height: 70vh;
    overflow: auto;
    z-index: 2;
  }

  > :deep(.preview) {
    min-height: 520px;
    max-height: 70vh;
  }
}

.actions {
  margin-top: 12px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.wait-hint {
  font-size: 0.85rem;
  color: var(--muted);
}

@media (max-width: 860px) {
  .workspace {
    grid-template-columns: 1fr;

    > :deep(.settings),
    > :deep(.preview) {
      max-height: none;
      min-height: 320px;
    }
  }
}
</style>
