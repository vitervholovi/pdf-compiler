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
      <label class="toggle-row">
        <input type="checkbox" v-model="convertToPdf" />
        Перетворити усі файли в PDF
      </label>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="!files.length || busy"
        @click="startJob"
      >
        {{ busy ? 'Обробка…' : 'Перетворити' }}
      </button>
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
import { defaultWatermark } from './utils/files.js';

const files = ref([]);
const selectedId = ref(null);
const watermark = ref(defaultWatermark());
const watermarkImageFile = ref(null);
const convertToPdf = ref(true);
const events = ref([]);
const downloadUrl = ref(null);
const busy = ref(false);
let es = null;

const selectedFile = computed(() => files.value.find((f) => f.id === selectedId.value) || null);

function onAdd(list) {
  const added = list.map((file) => ({
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
    file
  }));
  files.value.push(...added);
  if (!selectedId.value && added[0]) selectedId.value = added[0].id;
}

function onRemove(i) {
  const removed = files.value.splice(i, 1)[0];
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
  for (const f of files.value) fd.append('files', f.file, f.file.name);
  fd.append('convertToPdf', String(convertToPdf.value));
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
      if (data.type === 'completed' || data.type === 'failed') {
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
  grid-template-columns: minmax(240px, 300px) 1fr;
  gap: 12px;
  margin-top: 12px;
  min-height: 480px;
  align-items: stretch;

  > * {
    min-height: 480px;
    max-height: 70vh;
  }
}

.actions {
  margin-top: 12px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

@media (max-width: 860px) {
  .workspace {
    grid-template-columns: 1fr;
    > * {
      max-height: none;
    }
  }
}
</style>
