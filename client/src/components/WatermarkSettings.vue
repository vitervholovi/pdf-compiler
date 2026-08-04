<template>
  <aside class="settings panel">
    <h2>Watermark</h2>

    <div class="section">
      <label class="toggle-row">
        <input
          type="checkbox"
          :checked="modelValue.text.enabled"
          @change="patchText({ enabled: $event.target.checked })"
        />
        Текст
      </label>
      <template v-if="modelValue.text.enabled">
        <div class="field">
          <label>Текст</label>
          <input
            type="text"
            :value="modelValue.text.value"
            @input="patchText({ value: $event.target.value })"
          />
        </div>
        <div class="field">
          <label>Розмір шрифта (pt)</label>
          <input
            type="number"
            min="6"
            max="200"
            :value="modelValue.text.fontSizePt"
            @input="patchText({ fontSizePt: Number($event.target.value) || 12 })"
          />
        </div>
        <div class="field">
          <label>Шрифт</label>
          <select
            :value="modelValue.text.fontFamily"
            @change="patchText({ fontFamily: $event.target.value })"
          >
            <option>Helvetica</option>
            <option>Helvetica-Bold</option>
            <option>Times</option>
            <option>Times-Bold</option>
            <option>Courier</option>
          </select>
        </div>
        <div class="field">
          <label>Колір</label>
          <input
            type="color"
            :value="modelValue.text.color"
            @input="patchText({ color: $event.target.value })"
          />
        </div>
        <div class="field">
          <label>Прозорість ({{ modelValue.text.opacity }})</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="modelValue.text.opacity"
            @input="patchText({ opacity: Number($event.target.value) })"
          />
        </div>
        <div class="field">
          <label>Повторення</label>
          <select
            :value="modelValue.text.pattern"
            @change="patchText({ pattern: $event.target.value })"
          >
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
        <input
          type="checkbox"
          :checked="modelValue.image.enabled"
          @change="patchImage({ enabled: $event.target.checked })"
        />
        Зображення
      </label>
      <template v-if="modelValue.image.enabled">
        <div class="field">
          <label>Файл зображення</label>
          <input type="file" accept="image/*" @change="onImage" />
        </div>
        <div v-if="imageName" class="image-name">{{ imageName }}</div>
        <div class="field">
          <label>Прозорість ({{ modelValue.image.opacity }})</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="modelValue.image.opacity"
            @input="patchImage({ opacity: Number($event.target.value) })"
          />
        </div>
        <label class="toggle-row">
          <input
            type="checkbox"
            :checked="modelValue.image.grayscale"
            @change="patchImage({ grayscale: $event.target.checked })"
          />
          Чорно-біле
        </label>
        <div class="field">
          <label>Повторення</label>
          <select
            :value="modelValue.image.pattern"
            @change="patchImage({ pattern: $event.target.value })"
          >
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
import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  watermarkImageFile: { type: File, default: null }
});

const emit = defineEmits(['update:modelValue', 'update:watermarkImageFile']);

const imageName = ref(props.watermarkImageFile?.name || '');

watch(
  () => props.watermarkImageFile,
  (f) => {
    imageName.value = f?.name || '';
  }
);

function patchText(partial) {
  emit('update:modelValue', {
    ...props.modelValue,
    text: { ...props.modelValue.text, ...partial }
  });
}

function patchImage(partial) {
  emit('update:modelValue', {
    ...props.modelValue,
    image: { ...props.modelValue.image, ...partial }
  });
}

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
  background: var(--surface);
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
