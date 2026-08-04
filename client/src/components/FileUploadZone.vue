<template>
  <div
    class="upload-zone panel"
    :class="{ dragover, compact: files.length > 0 }"
    @dragenter.prevent="dragover = true"
    @dragover.prevent="dragover = true"
    @dragleave.prevent="onLeave"
    @drop.prevent="onDrop"
    @click="openPicker"
  >
    <input
      ref="input"
      type="file"
      multiple
      hidden
      @change="onPick"
      @click.stop
    />
    <p class="hint">
      Перетягніть файли сюди або натисніть
      <span>(doc, pdf, зображення, таблиці, djvu…)</span>
    </p>

    <div
      v-if="files.length"
      class="thumbs"
      ref="thumbs"
      @wheel.prevent="onWheel"
      @click.stop
    >
      <button
        v-for="(f, i) in files"
        :key="f.id"
        type="button"
        class="thumb"
        :class="{ active: f.id === selectedId }"
        @click="select(f.id)"
      >
        <span class="icon-wrap" :style="{ color: meta(f).color }">
          <Icon :icon="meta(f).icon" width="28" height="28" />
        </span>
        <span class="name" :title="f.file.name">{{ f.file.name }}</span>
        <span class="size">{{ formatBytes(f.file.size) }}</span>
        <span class="preview-badge" :class="f.previewStatus">{{ previewLabel(f) }}</span>
        <button type="button" class="remove" title="Прибрати" @click.stop="remove(i)">×</button>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Icon } from '@iconify/vue';
import { formatBytes, fileTypeMeta } from '../utils/files.js';

const props = defineProps({
  files: { type: Array, default: () => [] },
  selectedId: { type: String, default: null }
});

const emit = defineEmits(['add', 'remove', 'select']);

const input = ref(null);
const thumbs = ref(null);
const dragover = ref(false);

function meta(f) {
  return fileTypeMeta(f.file.name);
}

function openPicker() {
  input.value?.click();
}

function onPick(e) {
  const list = [...(e.target.files || [])];
  if (list.length) emit('add', list);
  e.target.value = '';
}

function onDrop(e) {
  dragover.value = false;
  const list = [...(e.dataTransfer?.files || [])];
  if (list.length) emit('add', list);
}

function onLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) dragover.value = false;
}

function onWheel(e) {
  if (!thumbs.value) return;
  thumbs.value.scrollLeft += e.deltaY + e.deltaX;
}

function select(id) {
  emit('select', id);
}

function remove(i) {
  emit('remove', i);
}

function previewLabel(f) {
  const map = {
    pending: 'чекає',
    converting: 'preview…',
    ready: f.previewKind === 'local-pdf' || f.previewKind === 'local-image' ? 'локально' : 'preview',
    error: 'помилка',
    unsupported: 'без вмісту',
    done: 'готово'
  };
  return map[f.previewStatus] || '';
}
</script>
