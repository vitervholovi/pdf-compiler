<template>
  <div class="progress panel" v-if="visible">
    <div class="head">
      <strong>Прогрес</strong>
      <span v-if="percent != null">{{ percent }}%</span>
    </div>
    <div class="bar"><div class="fill" :style="{ width: `${percent || 0}%` }" /></div>
    <ul class="log">
      <li v-for="(e, i) in events" :key="i" :class="e.type">
        <span class="t">{{ label(e) }}</span>
        <span v-if="e.currentFile" class="f">{{ e.currentFile }}</span>
        <span v-if="e.message" class="m">{{ e.message }}</span>
      </li>
    </ul>
    <a v-if="downloadUrl" class="btn btn-primary" :href="downloadUrl">Завантажити ZIP</a>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  events: { type: Array, default: () => [] },
  downloadUrl: { type: String, default: null }
});

const visible = computed(() => props.events.length > 0 || props.downloadUrl);
const percent = computed(() => {
  for (let i = props.events.length - 1; i >= 0; i--) {
    if (props.events[i].percent != null) return props.events[i].percent;
  }
  return 0;
});

function label(e) {
  const map = {
    queued: 'У черзі',
    file_start: 'Старт файлу',
    converting: 'Конвертація',
    watermarking: 'Watermark',
    file_done: 'Файл готовий',
    file_error: 'Помилка файлу',
    warning: 'Попередження',
    zipping: 'Архівування',
    cleanup: 'Очищення',
    completed: 'Завершено',
    failed: 'Невдача'
  };
  return map[e.type] || e.type;
}
</script>

<style scoped lang="scss">
.progress {
  margin-top: 0;
  padding: 8px 10px;
}

.head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 0.85rem;
}

.bar {
  height: 6px;
  background: #e5e5e0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 6px;
}

.fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}

.log {
  list-style: none;
  margin: 0 0 6px;
  padding: 0;
  max-height: 56px;
  overflow: auto;
  font-size: 0.75rem;

  li {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 2px 0;
    border-bottom: 1px solid #eee;
  }

  .t { font-weight: 600; min-width: 90px; }
  .f { color: var(--muted); }
  .m { color: var(--text); }

  .file_error .t,
  .failed .t,
  .warning .t { color: var(--danger); }
  .completed .t { color: var(--accent); }
}
</style>
