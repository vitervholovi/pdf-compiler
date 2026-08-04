<template>
  <aside class="settings panel settings-text">
    <h2>Текст</h2>
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
        <input
          type="text"
          :value="modelValue.text.value"
          @input="patchText({ value: $event.target.value })"
        />
      </div>
      <div class="field-row">
        <div class="field grow">
          <label>Розмір (pt)</label>
          <input
            type="number"
            min="6"
            max="200"
            :value="modelValue.text.fontSizePt"
            @input="patchText({ fontSizePt: Number($event.target.value) || 12 })"
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
    </template>
  </aside>
</template>

<script setup>
import { FONT_OPTIONS } from '../utils/fonts.js';

const props = defineProps({
  modelValue: { type: Object, required: true }
});

const emit = defineEmits(['update:modelValue']);
const fontOptions = FONT_OPTIONS;

function patchText(partial) {
  emit('update:modelValue', {
    ...props.modelValue,
    text: { ...props.modelValue.text, ...partial }
  });
}
</script>
