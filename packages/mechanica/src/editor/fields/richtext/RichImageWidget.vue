<template>
  <div class="mech-rt-image" contenteditable="false">
    <div v-if="block.src" class="mech-rt-image__frame">
      <img :src="(block.src as string)" class="mech-rt-image__img" alt="" />
      <div class="mech-rt-image__actions">
        <button type="button" class="mech-button" @click="pick">Replace</button>
        <button type="button" class="mech-button is-danger" @click="remove">Remove</button>
      </div>
    </div>

    <button
      v-else
      type="button"
      class="mech-rt-image__dropzone"
      :class="{ 'is-dragover': dragover }"
      @click="pick"
      @dragover.prevent="dragover = true"
      @dragleave="dragover = false"
      @drop.prevent="onDrop"
    >
      <VIcon name="image" class="mech-rt-image__glyph" />
      <span>{{ busy ? 'Uploading…' : 'Choose an image, or drop a file here' }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { inject, ref } from 'vue'
import type { Block } from 'vuewrite'
import VIcon from '../../components/VIcon.vue'
import { dialogKey } from '../../ui/dialog'
import ImagePickerDialog from '../../dialogs/ImagePickerDialog.vue'

type Uploader = (file: File) => Promise<{ src: string; previewSrc?: string }>

const props = defineProps<{ block: Block }>()
const emit = defineEmits<{ change: [] }>()

// Same upload machinery as the ImageField — pick from the project or drop a file.
const uploader = inject<Uploader | null>('mechFileUploader', null)
const dialog = inject(dialogKey, null)
const dragover = ref(false)
const busy = ref(false)

const set = (src: string): void => {
  ;(props.block as Record<string, unknown>).src = src
  emit('change')
}
const remove = (): void => set('')
const pick = (): void => {
  dialog?.open(ImagePickerDialog, { onSelect: (value: { src: string }) => set(value.src) })
}
const onDrop = async (event: DragEvent): Promise<void> => {
  dragover.value = false
  const file = event.dataTransfer?.files?.[0]
  if (!file || !uploader || busy.value) return
  busy.value = true
  try {
    set((await uploader(file)).src)
  } finally {
    busy.value = false
  }
}
</script>

<style lang="scss" scoped>
.mech-rt-image {
  margin: 0.5em 0;
}
.mech-rt-image__frame {
  position: relative;
  border-radius: var(--mech-radius);
  overflow: hidden;
  border: 1px solid var(--mech-border);
  background: var(--mech-active);
}
.mech-rt-image__img {
  display: block;
  width: 100%;
  max-height: 280px;
  object-fit: contain;
}
.mech-rt-image__actions {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(15, 18, 22, 0.42);
  opacity: 0;
  transition: opacity 0.12s;
}
.mech-rt-image__frame:hover .mech-rt-image__actions {
  opacity: 1;
}
.mech-rt-image__dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 22px 16px;
  border: 1px dashed var(--mech-input-border);
  border-radius: var(--mech-radius);
  background: var(--mech-bg);
  color: var(--mech-muted);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    border-color 0.12s,
    background 0.12s,
    color 0.12s;

  &:hover,
  &.is-dragover {
    border-color: var(--mech-accent);
    background: var(--mech-accent-soft);
    color: var(--mech-fg);
  }
}
.mech-rt-image__glyph {
  width: 22px;
  height: 22px;
  opacity: 0.7;
}
</style>
