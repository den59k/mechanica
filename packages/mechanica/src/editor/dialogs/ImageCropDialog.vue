<template>
  <VDialog :title="config ? 'Crop & position' : 'Image position'" size="wide">
    <div class="mech-crop">
      <div ref="frameEl" class="mech-crop__frame">
        <img
          :src="image.src"
          class="mech-crop__img"
          alt=""
          draggable="false"
          @load="onImageLoad"
        />

        <!-- Crop mode: a draggable/resizable frame darkening everything outside,
             with the focal point living inside it (the part that gets baked). -->
        <div
          v-if="config"
          class="mech-crop__box"
          :style="boxStyle"
          @pointerdown="onBoxDown"
        >
          <span
            v-for="handle in HANDLES"
            :key="handle"
            class="mech-crop__handle"
            :class="`mech-crop__handle--${handle}`"
            @pointerdown="onHandleDown($event, handle)"
          />
          <button
            type="button"
            class="mech-crop__focal"
            :style="focalInBoxStyle"
            title="Focal point — drag to set what stays in frame"
            @pointerdown="onFocalDown"
          />
        </div>

        <!-- Position-only mode: just the focal point over the whole image. -->
        <button
          v-else
          type="button"
          class="mech-crop__focal"
          :style="focalInFrameStyle"
          title="Focal point — drag to set the background/object position"
          @pointerdown="onFocalDown"
        />
      </div>

      <p class="mech-crop__hint">
        {{
          config
            ? 'Drag the frame to reposition, its corners to resize. The dot marks the focal point.'
            : 'Drag the dot to set the focal point used for background-position / object-position.'
        }}
      </p>
    </div>

    <template #actions>
      <button type="button" class="mech-button" @click="reset">Reset</button>
      <span class="mech-crop__spacer" />
      <button type="button" class="mech-button" @click="dialog.back()">Cancel</button>
      <button type="button" class="mech-button is-primary" :disabled="busy" @click="apply">
        {{ busy ? 'Applying…' : 'Apply' }}
      </button>
    </template>
  </VDialog>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type { ImageCropConfig } from 'mechanica-shared'
import VDialog from '../ui/VDialog.vue'
import { useDialog } from '../ui/dialog'
import { renderCrop, type NormalizedRect } from '../lib/image-size'
import {
  clamp01,
  clampRectPosition,
  cropTarget,
  defaultCropRect,
  derivativeName,
  normalizedAspect,
  resizeRect,
  resolveCropConfig,
  type EditorImageValue,
} from '../lib/image-crop'

type Corner = 'nw' | 'ne' | 'sw' | 'se'
const HANDLES: Corner[] = ['nw', 'ne', 'sw', 'se']

/** Uploads a cropped derivative under a caller-chosen name (kept out of the library). */
type DerivedUploader = (blob: Blob, name: string) => Promise<{ src: string }>

const props = defineProps<{
  image: EditorImageValue
  /** The field's `crop` annotation; absent → focal-point-only (position) editing. */
  crop?: ImageCropConfig
  onApply: (value: EditorImageValue) => void
}>()

const dialog = useDialog()
const uploader = inject<DerivedUploader | null>('mechDerivedUploader', null)

const config = resolveCropConfig(props.crop)
const frameEl = ref<HTMLElement>()
const busy = ref(false)

// Intrinsic size of the original — from the value, or measured on load. Drives
// the aspect-locked default frame and the resize ratio.
const natural = ref<{ w: number; h: number } | null>(
  props.image.width && props.image.height ? { w: props.image.width, h: props.image.height } : null,
)

const focal = ref({ x: props.image.focalX ?? 0.5, y: props.image.focalY ?? 0.5 })
const rect = ref<NormalizedRect>(
  props.image.crop ?? defaultCropRect(config?.aspect, natural.value?.w ?? 0, natural.value?.h ?? 0),
)

function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  if (!img.naturalWidth || !img.naturalHeight) return
  natural.value = { w: img.naturalWidth, h: img.naturalHeight }
  // If the frame is still at its default (no authored crop), recenter it now
  // that the true aspect is known.
  if (config && !props.image.crop) rect.value = defaultCropRect(config.aspect, img.naturalWidth, img.naturalHeight)
}

const pct = (n: number) => `${n * 100}%`
const boxStyle = computed(() => ({
  left: pct(rect.value.x),
  top: pct(rect.value.y),
  width: pct(rect.value.width),
  height: pct(rect.value.height),
}))
const focalInBoxStyle = computed(() => ({ left: pct(focal.value.x), top: pct(focal.value.y) }))
const focalInFrameStyle = computed(() => ({ left: pct(focal.value.x), top: pct(focal.value.y) }))

/** Normalized crop aspect (width/height in 0..1 space), or undefined for a free frame. */
const aspectN = computed(() =>
  config?.aspect && natural.value
    ? normalizedAspect(config.aspect, natural.value.w, natural.value.h)
    : undefined,
)

/** Run a pointer drag: `onMove` gets the pointer normalized (0..1) to `ref`. */
function drag(el: HTMLElement | undefined, event: PointerEvent, onMove: (x: number, y: number) => void) {
  if (!el) return
  event.preventDefault()
  const bounds = el.getBoundingClientRect()
  const move = (e: PointerEvent) => {
    onMove(
      bounds.width ? clamp01((e.clientX - bounds.left) / bounds.width) : 0,
      bounds.height ? clamp01((e.clientY - bounds.top) / bounds.height) : 0,
    )
  }
  move(event)
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function onFocalDown(event: PointerEvent) {
  event.stopPropagation()
  // The focal point is relative to the crop box (when cropping) or the whole
  // image, matching how <Image> reads it back off the rendered image.
  const el = config ? (event.currentTarget as HTMLElement).parentElement! : frameEl.value
  drag(el, event, (x, y) => (focal.value = { x, y }))
}

function onBoxDown(event: PointerEvent) {
  const start = rect.value
  drag(frameEl.value, event, (x, y) => {
    // Keep the grabbed point under the pointer — but drag() gives absolute
    // normalized coords, so anchor from the first move via a closure offset.
    boxDrag(start, x, y)
  })
}
// Offset captured on the first move so the box follows the pointer without jumping.
let boxOffset: { dx: number; dy: number } | null = null
function boxDrag(start: NormalizedRect, x: number, y: number) {
  if (!boxOffset) boxOffset = { dx: x - start.x, dy: y - start.y }
  rect.value = clampRectPosition({ ...start, x: x - boxOffset.dx, y: y - boxOffset.dy })
}

function onHandleDown(event: PointerEvent, handle: Corner) {
  event.stopPropagation()
  const r = rect.value
  const anchor = {
    nw: { x: r.x + r.width, y: r.y + r.height },
    ne: { x: r.x, y: r.y + r.height },
    sw: { x: r.x + r.width, y: r.y },
    se: { x: r.x, y: r.y },
  }[handle]
  drag(frameEl.value, event, (x, y) => {
    rect.value = resizeRect(anchor, { x, y }, aspectN.value)
  })
}

function reset() {
  focal.value = { x: 0.5, y: 0.5 }
  rect.value = defaultCropRect(config?.aspect, natural.value?.w ?? 0, natural.value?.h ?? 0)
}

const round3 = (n: number) => Math.round(n * 1000) / 1000
const isFullFrame = (r: NormalizedRect) =>
  r.x <= 0.002 && r.y <= 0.002 && r.width >= 0.998 && r.height >= 0.998

async function apply() {
  if (busy.value) return
  const next: EditorImageValue = { ...props.image }

  // Focal point: omit when centered so page files stay clean.
  const fx = round3(focal.value.x)
  const fy = round3(focal.value.y)
  if (fx === 0.5 && fy === 0.5) {
    delete next.focalX
    delete next.focalY
  } else {
    next.focalX = fx
    next.focalY = fy
  }

  const clearCrop = () => {
    delete next.crop
    delete next.croppedSrc
    delete next.croppedWidth
    delete next.croppedHeight
  }

  if (config && !isFullFrame(rect.value)) {
    const r = rect.value
    const target = cropTarget(config)
    busy.value = true
    try {
      const rendered = uploader ? await renderCrop(props.image.src, r, target) : null
      if (rendered && uploader) {
        const { src } = await uploader(rendered.blob, derivativeName(props.image.src, r, target))
        next.crop = {
          x: round3(r.x),
          y: round3(r.y),
          width: round3(r.width),
          height: round3(r.height),
        }
        next.croppedSrc = src
        next.croppedWidth = rendered.width
        next.croppedHeight = rendered.height
      } else {
        // Couldn't render/upload (SVG, no uploader) — keep focal-only, no crop.
        clearCrop()
      }
    } finally {
      busy.value = false
    }
  } else if (config) {
    // Frame dragged back to full → drop any previous crop derivative.
    clearCrop()
  }

  props.onApply(next)
  dialog.back()
}
</script>

<style lang="scss" scoped>
.mech-crop {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mech-crop__frame {
  position: relative;
  display: block;
  margin: 0 auto;
  max-width: 100%;
  line-height: 0;
  user-select: none;
  touch-action: none;
}
.mech-crop__img {
  display: block;
  max-width: 100%;
  max-height: 58vh;
  margin: 0 auto;
  border-radius: var(--mech-radius-sm);
}
.mech-crop__box {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 9999px rgba(15, 18, 22, 0.5);
  cursor: move;
  touch-action: none;
}
.mech-crop__handle {
  position: absolute;
  width: 14px;
  height: 14px;
  background: #fff;
  border: 1px solid var(--mech-border);
  border-radius: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  touch-action: none;

  &--nw {
    top: -7px;
    left: -7px;
    cursor: nwse-resize;
  }
  &--ne {
    top: -7px;
    right: -7px;
    cursor: nesw-resize;
  }
  &--sw {
    bottom: -7px;
    left: -7px;
    cursor: nesw-resize;
  }
  &--se {
    bottom: -7px;
    right: -7px;
    cursor: nwse-resize;
  }
}
.mech-crop__focal {
  position: absolute;
  width: 22px;
  height: 22px;
  padding: 0;
  transform: translate(-50%, -50%);
  border: 2px solid #fff;
  border-radius: var(--mech-radius-pill);
  background: rgba(15, 18, 22, 0.25);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.4),
    0 1px 4px rgba(0, 0, 0, 0.4);
  cursor: grab;

  &::after {
    content: '';
    position: absolute;
    inset: 7px;
    border-radius: 50%;
    background: #fff;
  }
  &:active {
    cursor: grabbing;
  }
}
.mech-crop__hint {
  margin: 0;
  color: var(--mech-muted);
  font-size: 12.5px;
  text-align: center;
}
.mech-crop__spacer {
  flex: 1;
}
</style>
