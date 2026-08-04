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

<style scoped lang="scss">
.upload-zone {
  padding: 8px 10px;
  min-height: 52px;
  max-height: 118px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;

  &.dragover {
    border-color: var(--accent);
    background: #f0f7f3;
  }
}

.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.25;
  flex-shrink: 0;

  span {
    color: #888;
    font-size: 0.72rem;
    margin-left: 4px;
  }
}

.thumbs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
  cursor: default;
  scrollbar-width: thin;
  min-height: 0;
}

.thumb {
  position: relative;
  flex: 0 0 92px;
  width: 92px;
  border: 1px solid var(--border);
  background: #fafafa;
  border-radius: var(--radius);
  padding: 6px 6px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;

  &.active {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
}

.icon-wrap {
  display: grid;
  place-items: center;
  height: 28px;
}

.name {
  font-size: 0.65rem;
  line-height: 1.15;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size {
  font-size: 0.6rem;
  color: var(--muted);
}

.preview-badge {
  font-size: 0.58rem;
  text-transform: lowercase;
  color: var(--muted);

  &.converting { color: #b78100; }
  &.ready { color: var(--accent); }
  &.error { color: var(--danger); }
}

.remove {
  position: absolute;
  top: 0;
  right: 2px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1;
  padding: 0 2px;
}
</style>
