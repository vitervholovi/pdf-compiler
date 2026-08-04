<template>
  <div
    class="upload-zone panel"
    :class="{ dragover }"
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
      Перетягніть файли сюди або натисніть, щоб обрати
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
          <Icon :icon="meta(f).icon" width="36" height="36" />
        </span>
        <span class="name" :title="f.file.name">{{ f.file.name }}</span>
        <span class="size">{{ formatBytes(f.file.size) }}</span>
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
</script>

<style scoped lang="scss">
.upload-zone {
  padding: 16px;
  min-height: 120px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &.dragover {
    border-color: var(--accent);
    background: #f0f7f3;
  }
}

.hint {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 0.95rem;

  span {
    display: block;
    font-size: 0.8rem;
    margin-top: 4px;
  }
}

.thumbs {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 6px;
  cursor: default;
  scrollbar-width: thin;
}

.thumb {
  position: relative;
  flex: 0 0 110px;
  width: 110px;
  border: 1px solid var(--border);
  background: #fafafa;
  border-radius: var(--radius);
  padding: 10px 8px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;

  &.active {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
}

.icon-wrap {
  display: grid;
  place-items: center;
  height: 40px;
}

.name {
  font-size: 0.72rem;
  line-height: 1.2;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size {
  font-size: 0.68rem;
  color: var(--muted);
}

.remove {
  position: absolute;
  top: 2px;
  right: 4px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 1rem;
  line-height: 1;
  padding: 0 2px;
}
</style>
