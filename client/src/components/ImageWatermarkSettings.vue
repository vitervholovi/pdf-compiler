<template>
  <aside class="settings panel settings-image">
    <h2>Зображення</h2>
    <p class="ori-hint">
      Позиція:
      <strong>{{ orientation === 'landscape' ? 'альбомна' : 'книжкова' }}</strong>
    </p>
    <label class="toggle-row">
      <input
        type="checkbox"
        :checked="modelValue.image.enabled"
        @change="patchImage({ enabled: $event.target.checked })"
      />
      Увімкнути
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
      <div v-if="modelValue.image.pattern !== 'single'" class="spacing-fields">
        <SpacingControl
          label="Відстань X"
          :model-value="placement.spacingX ?? 0"
          @update:model-value="patchPlacement({ spacingX: $event })"
        />
        <SpacingControl
          label="Відстань Y"
          :model-value="placement.spacingY ?? 0"
          @update:model-value="patchPlacement({ spacingY: $event })"
        />
      </div>
    </template>
  </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { getImagePlacement } from '../utils/watermarkModel.js';
import SpacingControl from './SpacingControl.vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  watermarkImageFile: { type: File, default: null },
  orientation: { type: String, default: 'portrait' }
});

const emit = defineEmits(['update:modelValue', 'update:watermarkImageFile']);

const imageName = ref(props.watermarkImageFile?.name || '');
const placement = computed(() => getImagePlacement(props.modelValue.image, props.orientation));

watch(
  () => props.watermarkImageFile,
  (f) => {
    imageName.value = f?.name || '';
  }
);

function patchImage(partial) {
  emit('update:modelValue', {
    ...props.modelValue,
    image: { ...props.modelValue.image, ...partial }
  });
}

function patchPlacement(partial) {
  const ori = props.orientation === 'landscape' ? 'landscape' : 'portrait';
  const cur = getImagePlacement(props.modelValue.image, ori);
  emit('update:modelValue', {
    ...props.modelValue,
    image: {
      ...props.modelValue.image,
      [ori]: {
        ...cur,
        ...partial,
        transform: { ...cur.transform, ...(partial.transform || {}) }
      }
    }
  });
}

function onImage(e) {
  const file = e.target.files?.[0] || null;
  imageName.value = file?.name || '';
  emit('update:watermarkImageFile', file);
}
</script>
