<template>
  <aside class="settings panel settings-image">
    <h2>Зображення</h2>
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
    </template>
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
