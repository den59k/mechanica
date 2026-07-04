<template>
  <VDialog title="Choose image" size="wide">
    <div class="mech-image-picker">
      <label
        class="mech-image-picker__upload"
        :class="{ 'is-dragover': dragover }"
        @dragover.prevent="dragover = true"
        @dragleave="dragover = false"
        @drop.prevent="onDrop"
      >
        <input class="mech-image-picker__file" type="file" accept="image/*" @change="onPick" />
        <VIcon name="upload" class="mech-image-picker__upload-glyph" />
        <span class="mech-image-picker__upload-text">
          {{ busy ? 'Uploading…' : 'Drop an image here, or click to upload' }}
        </span>
      </label>

      <div class="mech-image-picker__lib-head">Project images</div>
      <div v-if="images.length" class="mech-image-picker__grid">
        <button
          v-for="img in images"
          :key="img.id"
          type="button"
          class="mech-image-picker__item"
          :title="img.name"
          @click="select({ src: img.src })"
        >
          <img :src="img.src" :alt="img.name" loading="lazy" />
        </button>
      </div>
      <p v-else class="mech-image-picker__empty">
        {{ loaded ? 'No images uploaded yet — upload one above.' : 'Loading…' }}
      </p>
    </div>
    <template #actions>
      <button type="button" class="mech-button" @click="dialog.back()">Back</button>
    </template>
  </VDialog>
</template>

<script setup lang="ts">
import { inject, onMounted, ref } from 'vue'
import VDialog from '../ui/VDialog.vue'
import VIcon from '../components/VIcon.vue'
import { useDialog } from '../ui/dialog'
import { readImageSize } from '../lib/image-size'

interface ImageValue {
  src: string
  previewSrc?: string
  alt?: string
  width?: number
  height?: number
}
interface LibraryImage {
  id: string
  name: string
  src: string
}
type Uploader = (file: File) => Promise<{ src: string; previewSrc?: string }>
type Library = () => Promise<LibraryImage[]>

const props = defineProps<{ onSelect: (value: ImageValue) => void }>()

const dialog = useDialog()
const uploader = inject<Uploader | null>('mechFileUploader', null)
const library = inject<Library | null>('mechImageLibrary', null)

const images = ref<LibraryImage[]>([])
const loaded = ref(false)
const busy = ref(false)
const dragover = ref(false)

onMounted(load)
async function load() {
  try {
    if (library) images.value = await library()
  } catch {
    /* dev server unavailable */
  } finally {
    loaded.value = true
  }
}

// Apply a chosen image and close the dialog — with its intrinsic pixel size,
// so blocks can render width/height attributes (no layout shift). Measured
// from `src`, never `previewSrc` (which may be a downscaled preview).
async function select(value: ImageValue) {
  const size = await readImageSize(value.src)
  props.onSelect(size ? { ...value, ...size } : value)
  dialog.back()
}

async function upload(file: File) {
  if (!uploader || busy.value) return
  busy.value = true
  try {
    const result = await uploader(file)
    select({ src: result.src, previewSrc: result.previewSrc ?? result.src })
  } finally {
    busy.value = false
  }
}

const onPick = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) void upload(file)
}
const onDrop = (event: DragEvent) => {
  dragover.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) void upload(file)
}
</script>

<style lang="scss" scoped>
.mech-image-picker {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 36vh;
}
.mech-image-picker__upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 26px 16px;
  border: 1px dashed var(--mech-input-border);
  border-radius: var(--mech-radius);
  color: var(--mech-muted);
  font-size: 13px;
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
.mech-image-picker__file {
  display: none;
}
.mech-image-picker__upload-glyph {
  width: 26px;
  height: 26px;
  opacity: 0.7;
}
.mech-image-picker__lib-head {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--mech-muted);
}
.mech-image-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}
.mech-image-picker__item {
  display: block;
  padding: 0;
  border: 1px solid var(--mech-border);
  border-radius: var(--mech-radius-sm);
  background: var(--mech-active);
  cursor: pointer;
  overflow: hidden;
  aspect-ratio: 1;
  transition:
    border-color 0.12s,
    box-shadow 0.12s;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  &:hover {
    border-color: var(--mech-accent);
    box-shadow: 0 0 0 2px var(--mech-ring);
  }
}
.mech-image-picker__empty {
  margin: 0;
  padding: 8px 0;
  color: var(--mech-muted);
  font-size: 13px;
}
</style>
