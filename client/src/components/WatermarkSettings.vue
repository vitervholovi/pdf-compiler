<template>
  <aside class="settings panel">
    <h2>Watermark</h2>

    <div class="section">
      <label class="toggle-row">
        <input type="checkbox" v-model="local.text.enabled" />
        Текст
      </label>
      <template v-if="local.text.enabled">
        <div class="field">
          <label>Текст</label>
          <input type="text" v-model="local.text.value" />
        </div>
        <div class="field">
          <label>Розмір шрифта (pt)</label>
          <input type="number" min="6" max="200" v-model.number="local.text.fontSizePt" />
        </div>
        <div class="field">
          <label>Шрифт</label>
          <select v-model="local.text.fontFamily">
            <option>Helvetica</option>
            <option>Helvetica-Bold</option>
            <option>Times</option>
            <option>Times-Bold</option>
            <option>Courier</option>
          </select>
        </div>
        <div class="field">
          <label>Колір</label>
          <input type="color" v-model="local.text.color" />
        </div>
        <div class="field">
          <label>Прозорість ({{ local.text.opacity }})</label>
          <input type="range" min="0" max="1" step="0.01" v-model.number="local.text.opacity" />
        </div>
        <div class="field">
          <label>Повторення</label>
          <select v-model="local.text.pattern">
            <option value="single">Один раз</option>
            <option value="tile">Плитка</option>
            <option value="diagonal">Діагональ</option>
            <option value="grid">Сітка</option>
          </select>
        </div>
      </template>
    </div>

    <div class="section">
      <label class="toggle-row">
        <input type="checkbox" v-model="local.image.enabled" />
        Зображення
      </label>
      <template v-if="local.image.enabled">
        <div class="field">
          <label>Файл зображення</label>
          <input type="file" accept="image/*" @change="onImage" />
        </div>
        <div v-if="imageName" class="image-name">{{ imageName }}</div>
        <div class="field">
          <label>Прозорість ({{ local.image.opacity }})</label>
          <input type="range" min="0" max="1" step="0.01" v-model.number="local.image.opacity" />
        </div>
        <label class="toggle-row">
          <input type="checkbox" v-model="local.image.grayscale" />
          Чорно-біле
        </label>
        <div class="field">
          <label>Повторення</label>
          <select v-model="local.image.pattern">
            <option value="single">Один раз</option>
            <option value="tile">Плитка</option>
            <option value="diagonal">Діагональ</option>
            <option value="grid">Сітка</option>
          </select>
        </div>
      </template>
    </div>
  </aside>
</template>

<script setup>
import { reactive, watch, ref } from 'vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  watermarkImageFile: { type: File, default: null }
});

const emit = defineEmits(['update:modelValue', 'update:watermarkImageFile']);

const local = reactive(structuredClone(props.modelValue));
const imageName = ref(props.watermarkImageFile?.name || '');

watch(
  local,
  () => emit('update:modelValue', structuredClone(local)),
  { deep: true }
);

watch(
  () => props.modelValue,
  (v) => {
    // sync fontSize / transforms from preview back into form
    Object.assign(local.text, structuredClone(v.text));
    Object.assign(local.image, structuredClone(v.image));
  },
  { deep: true }
);

function onImage(e) {
  const file = e.target.files?.[0] || null;
  imageName.value = file?.name || '';
  emit('update:watermarkImageFile', file);
}
</script>

<style scoped lang="scss">
.settings {
  padding: 14px;
  overflow: auto;
  min-height: 0;
}

h2 {
  margin: 0 0 12px;
  font-size: 1rem;
}

.section {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 4px;
}

.image-name {
  font-size: 0.75rem;
  color: var(--muted);
  margin-bottom: 8px;
  word-break: break-all;
}
</style>
