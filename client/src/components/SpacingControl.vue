<template>
  <div class="field spacing-field">
    <label>{{ label }} ({{ displayValue }})</label>
    <div class="spacing-control">
      <input
        type="range"
        class="spacing-range"
        :min="sliderMin"
        :max="sliderMax"
        step="1"
        :value="clampedSlider"
        @input="onSlider"
      />
      <input
        type="number"
        class="spacing-number"
        :min="min"
        :max="max"
        step="1"
        :value="modelValue"
        @input="onNumber"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: -500 },
  max: { type: Number, default: 500 },
  sliderMin: { type: Number, default: -200 },
  sliderMax: { type: Number, default: 400 }
});

const emit = defineEmits(['update:modelValue']);

const displayValue = computed(() => Number(props.modelValue) || 0);

const clampedSlider = computed(() => {
  const v = Number(props.modelValue) || 0;
  return Math.min(props.sliderMax, Math.max(props.sliderMin, v));
});

function emitValue(raw) {
  let n = Number(raw);
  if (!Number.isFinite(n)) n = 0;
  n = Math.min(props.max, Math.max(props.min, Math.round(n)));
  emit('update:modelValue', n);
}

function onSlider(e) {
  emitValue(e.target.value);
}

function onNumber(e) {
  emitValue(e.target.value);
}
</script>
