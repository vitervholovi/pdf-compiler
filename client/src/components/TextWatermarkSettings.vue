<template>
  <aside class="settings panel settings-text">
    <h2>Текст</h2>
    <p class="ori-hint">
      Позиція:
      <strong>{{ orientation === 'landscape' ? 'альбомна' : 'книжкова' }}</strong>
    </p>
    <label class="toggle-row">
      <input
        type="checkbox"
        :checked="modelValue.text.enabled"
        @change="patchText({ enabled: $event.target.checked })"
      />
      Увімкнути
    </label>
    <template v-if="modelValue.text.enabled">
      <div class="field">
        <label>Текст</label>
        <textarea
          rows="3"
          :value="modelValue.text.value"
          @input="patchText({ value: $event.target.value })"
        />
      </div>
      <div class="field">
        <label>Вирівнювання</label>
        <select
          :value="modelValue.text.align || 'center'"
          @change="patchText({ align: $event.target.value })"
        >
          <option value="left">Зліва</option>
          <option value="center">По центру</option>
          <option value="right">Справа</option>
          <option value="justify">По ширині</option>
        </select>
      </div>
      <div class="field-row">
        <div class="field grow">
          <label>Розмір (pt)</label>
          <input
            type="number"
            min="6"
            max="200"
            :value="placement.fontSizePt"
            @input="patchPlacement({ fontSizePt: Number($event.target.value) || 12 })"
          />
        </div>
        <div class="field grow">
          <label>Колір</label>
          <input
            type="color"
            :value="modelValue.text.color"
            @input="patchText({ color: $event.target.value })"
          />
        </div>
      </div>
      <div class="field">
        <label>Шрифт</label>
        <select
          :value="modelValue.text.fontFamily"
          @change="patchText({ fontFamily: $event.target.value })"
        >
          <option v-for="f in fontOptions" :key="f.id" :value="f.id">{{ f.label }}</option>
        </select>
      </div>
      <div class="style-row">
        <label class="style-btn" :class="{ on: modelValue.text.bold }">
          <input type="checkbox" :checked="!!modelValue.text.bold" @change="patchText({ bold: $event.target.checked })" />
          <span><b>B</b></span>
        </label>
        <label class="style-btn" :class="{ on: modelValue.text.italic }">
          <input type="checkbox" :checked="!!modelValue.text.italic" @change="patchText({ italic: $event.target.checked })" />
          <span><i>I</i></span>
        </label>
        <label class="style-btn" :class="{ on: modelValue.text.underline }">
          <input type="checkbox" :checked="!!modelValue.text.underline" @change="patchText({ underline: $event.target.checked })" />
          <span><u>U</u></span>
        </label>
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
      <div v-if="modelValue.text.pattern !== 'single'" class="spacing-fields">
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
import { computed } from 'vue';
import { FONT_OPTIONS } from '../utils/fonts.js';
import { getTextPlacement } from '../utils/watermarkModel.js';
import SpacingControl from './SpacingControl.vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  orientation: { type: String, default: 'portrait' }
});

const emit = defineEmits(['update:modelValue']);
const fontOptions = FONT_OPTIONS;

const placement = computed(() => getTextPlacement(props.modelValue.text, props.orientation));

function patchText(partial) {
  emit('update:modelValue', {
    ...props.modelValue,
    text: { ...props.modelValue.text, ...partial }
  });
}

function patchPlacement(partial) {
  const ori = props.orientation === 'landscape' ? 'landscape' : 'portrait';
  const cur = getTextPlacement(props.modelValue.text, ori);
  emit('update:modelValue', {
    ...props.modelValue,
    text: {
      ...props.modelValue.text,
      [ori]: {
        ...cur,
        ...partial,
        transform: { ...cur.transform, ...(partial.transform || {}) }
      }
    }
  });
}
</script>
