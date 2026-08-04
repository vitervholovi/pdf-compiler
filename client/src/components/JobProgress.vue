<template>
  <div class="progress panel" v-if="visible">
    <div class="head">
      <strong>Прогрес</strong>
      <span v-if="percent != null">{{ percent }}%</span>
    </div>
    <div class="bar"><div class="fill" :style="{ width: `${percent || 0}%` }" /></div>
    <ul class="log" ref="logEl">
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
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps({
  events: { type: Array, default: () => [] },
  downloadUrl: { type: String, default: null }
});

const logEl = ref(null);

const visible = computed(() => props.events.length > 0 || props.downloadUrl);
const percent = computed(() => {
  for (let i = props.events.length - 1; i >= 0; i--) {
    if (props.events[i].percent != null) return props.events[i].percent;
  }
  return 0;
});

watch(
  () => props.events.length,
  async () => {
    await nextTick();
    const el = logEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  }
);

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
