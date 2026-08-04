<template>
  <div class="app-shell">
    <header class="top">
      <div class="titles">
        <h1>PDF Compiler</h1>
        <p class="subtitle">Документи, watermark і конвертація в PDF</p>
      </div>
      <div class="actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!files.length || busy"
          @click="startJob"
        >
          {{ busy ? 'Обробка…' : 'Перетворити' }}
        </button>
        <span v-if="convertingCount" class="wait-hint">
          Preview: {{ convertingCount }}…
        </span>
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
      <TextWatermarkSettings v-model="watermark" />
      <ImageWatermarkSettings
        v-model="watermark"
        v-model:watermark-image-file="watermarkImageFile"
      />
      <DocumentPreview
        :file="selectedFile"
        v-model:watermark="watermark"
        :watermark-image-file="watermarkImageFile"
      />
    </div>

    <JobProgress class="progress-slot" :events="events" :download-url="downloadUrl" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import FileUploadZone from './components/FileUploadZone.vue';
import TextWatermarkSettings from './components/TextWatermarkSettings.vue';
import ImageWatermarkSettings from './components/ImageWatermarkSettings.vue';
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
.app-shell {
  height: 100vh;
  max-height: 100vh;
  max-width: none;
  margin: 0;
  padding: 10px 12px;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 8px;
  overflow: hidden;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 0;
}

.titles {
  min-width: 0;

  h1 {
    margin: 0;
    font-size: 1.15rem;
  }

  .subtitle {
    margin: 2px 0 0;
    font-size: 0.8rem;
  }
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.wait-hint {
  font-size: 0.8rem;
  color: var(--muted);
  white-space: nowrap;
}

.upload {
  min-height: 0;
  flex-shrink: 0;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(180px, 220px) minmax(0, 1fr);
  gap: 8px;
  min-height: 0;
  overflow: hidden;
  align-items: stretch;

  > :deep(.settings),
  > :deep(.preview) {
    min-height: 0;
    height: 100%;
    max-height: none;
    overflow: auto;
  }

  > :deep(.preview) {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
}

.progress-slot {
  min-height: 0;
  max-height: 120px;
  overflow: auto;
}

@media (max-width: 960px) {
  .workspace {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: minmax(0, 1fr) minmax(0, 1.4fr);

    > :deep(.preview) {
      grid-column: 1 / -1;
    }
  }
}
</style>
