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
  /** Slider track limits; number input may go outside. */
  sliderMin: { type: Number, default: -500 },
  sliderMax: { type: Number, default: 500 }
});

const emit = defineEmits(['update:modelValue']);

const displayValue = computed(() => Number(props.modelValue) || 0);

const clampedSlider = computed(() => {
  const v = Number(props.modelValue) || 0;
  return Math.min(props.sliderMax, Math.max(props.sliderMin, v));
});

function emitValue(raw, { clampToSlider = false } = {}) {
  let n = Number(raw);
  if (!Number.isFinite(n)) n = 0;
  n = Math.round(n);
  if (clampToSlider) {
    n = Math.min(props.sliderMax, Math.max(props.sliderMin, n));
  }
  emit('update:modelValue', n);
}

function onSlider(e) {
  emitValue(e.target.value, { clampToSlider: true });
}

function onNumber(e) {
  emitValue(e.target.value);
}
</script>
