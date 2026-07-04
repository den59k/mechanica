<template>
  <div class="mech-image">
    <!-- Chosen: preview with hover actions + alt text (image SEO / a11y). -->
    <div v-if="value.src" class="mech-image__chosen">
      <div class="mech-image__frame">
        <!-- Always the real file: previewSrc may be a ~24px LQIP data URI. -->
        <img :src="value.src" class="mech-image__preview" :alt="value.alt ?? ''" />
        <div class="mech-image__actions">
          <button type="button" class="mech-button" @click="openPicker">Replace</button>
          <button type="button" class="mech-button is-danger" @click="clear">Remove</button>
        </div>
      </div>
      <input
        class="mech-input"
        type="text"
        :value="value.alt ?? ''"
        placeholder="Alt text — describe the image"
        @input="onAlt"
      />
    </div>

    <!-- Empty: a drop zone that opens the picker or accepts a dropped file. -->
    <button
      v-else
      type="button"
      class="mech-image__dropzone"
      :class="{ 'is-dragover': dragover }"
      @click="openPicker"
      @dragover.prevent="dragover = true"
      @dragleave="dragover = false"
      @drop.prevent="onDrop"
    >
      <VIcon name="image" class="mech-image__glyph" />
      <span class="mech-image__hint">{{ busy ? 'Uploading…' : 'Choose an image, or drop a file here' }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import VIcon from '../../components/VIcon.vue'
import { dialogKey } from '../../ui/dialog'
import { analyzeImageFile, readImageSize } from '../../lib/image-size'
import ImagePickerDialog from '../../dialogs/ImagePickerDialog.vue'

interface ImageValue {
  src: string
  previewSrc?: string
  alt?: string
  width?: number
  height?: number
}
type Uploader = (file: File) => Promise<{ src: string; previewSrc?: string }>

const props = defineProps<{ modelValue?: ImageValue; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [ImageValue] }>()

const value = computed<ImageValue>(() => props.modelValue ?? { src: '' })
const uploader = inject<Uploader | null>('mechFileUploader', null)
const dialog = inject(dialogKey, null)
const dragover = ref(false)
const busy = ref(false)

const set = (next: ImageValue) => emit('update:modelValue', next)
const clear = () => set({ src: '' })
const onAlt = (event: Event) => set({ ...value.value, alt: (event.target as HTMLInputElement).value })

// Open the picker (upload a new file or reuse one already in the project).
// A replacement keeps the authored alt text — cheaper to re-edit than retype.
const openPicker = () =>
  dialog?.open(ImagePickerDialog, { onSelect: (next: ImageValue) => set({ ...next, alt: value.value.alt }) })

// Dropping a file onto the empty zone uploads it directly — the quick path.
const onDrop = async (event: DragEvent) => {
  dragover.value = false
  const file = event.dataTransfer?.files?.[0]
  if (!file || !uploader || busy.value) return
  busy.value = true
  try {
    // Upload and local decode (dimensions + LQIP blur-up preview) in parallel;
    // when the file can't be decoded locally, measure the uploaded URL instead.
    const [result, info] = await Promise.all([uploader(file), analyzeImageFile(file)])
    const size = info ?? (await readImageSize(result.src))
    set({
      src: result.src,
      previewSrc: info?.lqip ?? result.previewSrc ?? result.src,
      ...(size ? { width: size.width, height: size.height } : {}),
    })
  } finally {
    busy.value = false
  }
}
</script>

<style lang="scss" scoped>
.mech-image__chosen {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mech-image__frame {
  position: relative;
  border-radius: var(--mech-radius);
  overflow: hidden;
  border: 1px solid var(--mech-border);
  background: var(--mech-active);
}
.mech-image__preview {
  display: block;
  width: 100%;
  max-height: 180px;
  object-fit: cover;
}
.mech-image__actions {
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
.mech-image__frame:hover .mech-image__actions {
  opacity: 1;
}

.mech-image__dropzone {
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
.mech-image__glyph {
  width: 22px;
  height: 22px;
  opacity: 0.7;
}
</style>
