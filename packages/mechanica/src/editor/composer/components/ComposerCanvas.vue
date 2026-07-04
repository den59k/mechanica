<template>
  <div
    ref="viewportEl"
    class="mech-composer__viewport"
    :class="{ 'is-panning': panning }"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @mousedown.middle.prevent
  >
    <div class="mech-composer__world" :style="worldStyle">
      <div ref="canvasEl" class="mech-composer__canvas" :style="canvasStyle" @click.capture="onClick">
        <CanvasContent />
        <div v-if="!store.template.length" class="mech-composer__empty">
          <p>This block is empty.</p>
          <p>Drag a Frame or Text from the left — or click one — to get started.</p>
        </div>
      </div>
    </div>
    <SelectionStyle />

    <!-- Floating zoom controls (Figma-style) -->
    <div class="mech-composer__zoombar">
      <button type="button" class="mech-icon-button" title="Zoom out" @click="zoomStep(1 / 1.2)">−</button>
      <button type="button" class="mech-composer__zoom-fit" title="Fit to view" @click="fit()">
        {{ Math.round(store.zoom * 100) }}%
      </button>
      <button type="button" class="mech-icon-button" title="Zoom in" @click="zoomStep(1.2)">+</button>
    </div>

    <!-- Drag-to-insert overlays: client-fixed, non-interactive so hit-testing
         still sees the canvas underneath. -->
    <Teleport to="body">
      <div
        v-if="insert.indicator"
        class="mech-composer__drop"
        :class="`is-${insert.indicator.kind}`"
        :style="dropStyle"
      />
      <div v-if="insert.dragging && insert.pointer" class="mech-composer__ghost" :style="ghostStyle">
        {{ insert.label }}
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, inject, nextTick, onBeforeUnmount, onMounted, ref, type ComputedRef } from 'vue'
import { renderBlocks } from '../../../core/render-blocks'
import type { BlocksMap } from '../../../core/state'
import { composerStoreKey, composerInsertDndKey } from '../lib/keys'
import { resolveForCanvas } from '../lib/canvas'
import { zoomAround, fitView, wheelZoomFactor, type View } from '../lib/canvas-view'

const store = inject(composerStoreKey)!
const insert = inject(composerInsertDndKey)!
const blocks = inject<BlocksMap>('composerBlocks')!
const bpWidth = inject<ComputedRef<number>>('composerBreakpointWidth')!

const viewportEl = ref<HTMLElement>()
const canvasEl = ref<HTMLElement>()

// A functional component so the tree re-renders whenever the template, the
// breakpoint, the preview props, or any node's data changes (all reactive).
const CanvasContent = defineComponent({
  name: 'ComposerCanvasContent',
  setup() {
    return () => renderBlocks(resolveForCanvas(store.template, store.breakpoint, store.previewProps), blocks)
  },
})

// Outline the selected element via a single dynamic rule — no rect math, the
// outline tracks the element wherever it lands in the flex layout.
const SelectionStyle = defineComponent({
  name: 'ComposerSelectionStyle',
  setup() {
    return () =>
      store.selectedId
        ? h('style', `[data-block-id="${store.selectedId}"]{outline:2px solid #3b82f6 !important;outline-offset:-1px;cursor:pointer;}`)
        : null
  },
})

// ── View: pan + zoom, applied as one world transform ──────────────────────────
const worldStyle = computed(() => ({
  transform: `translate(${store.panX}px, ${store.panY}px) scale(${store.zoom})`,
  transformOrigin: '0 0',
}))
const canvasStyle = computed(() => ({ width: `${bpWidth.value}px` }))

const view = (): View => ({ zoom: store.zoom, panX: store.panX, panY: store.panY })
const applyView = (v: View) => {
  store.zoom = v.zoom
  store.panX = v.panX
  store.panY = v.panY
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  const rect = viewportEl.value!.getBoundingClientRect()
  const cx = event.clientX - rect.left
  const cy = event.clientY - rect.top
  // Pinch on a touchpad and Ctrl/⌘+wheel both arrive as a wheel with ctrlKey.
  if (event.ctrlKey || event.metaKey) {
    applyView(zoomAround(view(), wheelZoomFactor(event.deltaY, event.deltaMode), cx, cy))
  } else {
    // Two-finger scroll / shift-wheel pans the canvas.
    store.panX -= event.deltaX
    store.panY -= event.deltaY
  }
}

function zoomStep(factor: number) {
  const rect = viewportEl.value!.getBoundingClientRect()
  applyView(zoomAround(view(), factor, rect.width / 2, rect.height / 2))
}

function fit() {
  const rect = viewportEl.value?.getBoundingClientRect()
  if (!rect) return
  const height = canvasEl.value?.offsetHeight ?? 400
  applyView(fitView(rect.width, rect.height, bpWidth.value, height))
}

// ── Panning with the middle mouse button (wheel) ──────────────────────────────
const panning = ref(false)
let panStart: { x: number; y: number; panX: number; panY: number } | null = null

function onPointerDown(event: PointerEvent) {
  if (event.button !== 1) return // middle button only
  event.preventDefault()
  panning.value = true
  panStart = { x: event.clientX, y: event.clientY, panX: store.panX, panY: store.panY }
  window.addEventListener('pointermove', onPanMove)
  window.addEventListener('pointerup', onPanUp)
}
function onPanMove(event: PointerEvent) {
  if (!panStart) return
  store.panX = panStart.panX + (event.clientX - panStart.x)
  store.panY = panStart.panY + (event.clientY - panStart.y)
}
function onPanUp() {
  panning.value = false
  panStart = null
  window.removeEventListener('pointermove', onPanMove)
  window.removeEventListener('pointerup', onPanUp)
}

// ── Selection ─────────────────────────────────────────────────────────────────
function onClick(event: MouseEvent) {
  const el = (event.target as HTMLElement).closest('[data-block-id]')
  // Intercept in the capture phase so a clicked button/link selects instead of
  // navigating, and a click on empty canvas deselects.
  if (el) {
    event.preventDefault()
    event.stopPropagation()
    store.select(el.getAttribute('data-block-id'))
  } else {
    store.select(null)
  }
}

// ── Insert overlays (client-fixed) ────────────────────────────────────────────
const dropStyle = computed(() => {
  const i = insert.indicator!
  return { left: `${i.x}px`, top: `${i.y}px`, width: `${i.w}px`, height: `${i.h}px` }
})
const ghostStyle = computed(() => ({ left: `${insert.pointer!.x}px`, top: `${insert.pointer!.y}px` }))

onMounted(() => nextTick(fit))
onBeforeUnmount(onPanUp)
</script>
