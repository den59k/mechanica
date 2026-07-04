<template>
  <div
    ref="viewportEl"
    class="mech-composer__viewport"
    :class="{ 'is-panning': panning }"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onHoverMove"
    @pointerleave="hoverId = null"
    @mousedown.middle.prevent
  >
    <div class="mech-composer__world" :style="worldStyle">
      <div
        ref="canvasEl"
        class="mech-composer__canvas"
        :class="{ 'is-editing': !!editingId }"
        :style="canvasStyle"
        @pointerdown="onCanvasPointerDown"
        @click.capture="onClick"
        @dblclick="onCanvasDblClick"
      >
        <CanvasContent />
        <div v-if="isEmpty" class="mech-composer__empty">
          <p>This block is empty.</p>
          <p>Drag a Row, Column, or Text from the left — or click one — to get started.</p>
        </div>
      </div>
    </div>
    <CanvasOverlay :hover-id="hoverId" />

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
import { computed, defineComponent, inject, nextTick, onBeforeUnmount, onMounted, ref, type ComputedRef } from 'vue'
import { isBinding, type ContentBlock } from 'mechanica-shared'
import { renderBlocks } from '../../../core/render-blocks'
import type { BlocksMap } from '../../../core/state'
import { composerStoreKey, composerInsertDndKey, composerHistoryKey } from '../lib/keys'
import { findBlock } from '../../lib/content-tree'
import { blockLabel, elementKind } from '../lib/elements-meta'
import { resolveForCanvas } from '../lib/canvas'
import { zoomAround, fitView, wheelZoomFactor, type View } from '../lib/canvas-view'
import CanvasOverlay from './CanvasOverlay.vue'

const store = inject(composerStoreKey)!
const insert = inject(composerInsertDndKey)!
const history = inject(composerHistoryKey)!
const blocks = inject<BlocksMap>('composerBlocks')!
const bpWidth = inject<ComputedRef<number>>('composerBreakpointWidth')!

const hoverId = ref<string | null>(null)
const editingId = ref<string | null>(null)

const viewportEl = ref<HTMLElement>()
const canvasEl = ref<HTMLElement>()

const isEmpty = computed(() => {
  const children = store.rootFrame.children
  return !children || (Array.isArray(children) ? children.length === 0 : Object.keys(children).length === 0)
})

// A functional component so the tree re-renders whenever the template, the
// breakpoint, the preview props, or any node's data changes (all reactive).
const CanvasContent = defineComponent({
  name: 'ComposerCanvasContent',
  setup() {
    return () => renderBlocks(resolveForCanvas(store.template, store.breakpoint, store.previewProps), blocks)
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
  if (editingId.value) return // let clicks place the caret while editing text
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

// ── Hover highlight ───────────────────────────────────────────────────────────
function onHoverMove(event: PointerEvent) {
  if (insert.dragging || panning.value || editingId.value) {
    hoverId.value = null
    return
  }
  const el = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest('[data-block-id]')
  hoverId.value = el?.getAttribute('data-block-id') ?? null
}

// ── Inline text editing (double-click) ────────────────────────────────────────
function onCanvasDblClick(event: MouseEvent) {
  const el = (event.target as HTMLElement).closest('[data-block-id]') as HTMLElement | null
  if (!el) return
  const id = el.getAttribute('data-block-id')!
  const node = findBlock(store.template, id)
  // Only plain (unbound) text edits inline — a $bind value is a variable.
  if (!node || elementKind(node.blockId) !== 'text' || isBinding(node.data.content)) return

  store.select(id)
  editingId.value = id
  el.setAttribute('contenteditable', 'plaintext-only')
  el.focus()
  const range = document.createRange()
  range.selectNodeContents(el)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)

  const finish = (commit: boolean) => {
    el.removeAttribute('contenteditable')
    if (commit) store.setData(id, { content: el.textContent ?? '' })
    else el.textContent = String(node.data.content ?? '')
    editingId.value = null
    el.removeEventListener('blur', onBlur)
    el.removeEventListener('keydown', onKey)
  }
  const onBlur = () => finish(true)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      el.blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      finish(false)
    }
  }
  el.addEventListener('blur', onBlur)
  el.addEventListener('keydown', onKey)
}

// ── Move / drag on canvas ─────────────────────────────────────────────────────
function onCanvasPointerDown(event: PointerEvent) {
  if (event.button !== 0 || editingId.value) return // left button only; not while editing
  const el = (event.target as HTMLElement).closest('[data-block-id]')
  if (!el) return // empty canvas → the click handler deselects
  const id = el.getAttribute('data-block-id')!
  store.select(id)
  if (id === store.rootId) return // the block itself doesn't move
  const node = findBlock(store.template, id)
  if (!node) return
  if (node.data.$abs) startAbsDrag(id, node, event)
  else insert.armMove(id, blockLabel(node), event)
}

/** Free-drag an absolutely-placed child inside its parent (writes `$abs.x/y`). */
function startAbsDrag(id: string, node: ContentBlock, event: PointerEvent) {
  const abs = (node.data.$abs ?? {}) as Record<string, unknown>
  const startX = typeof abs.x === 'number' ? abs.x : 0
  const startY = typeof abs.y === 'number' ? abs.y : 0
  const originX = event.clientX
  const originY = event.clientY
  let moved = false
  const onMove = (e: PointerEvent) => {
    if (!moved && Math.hypot(e.clientX - originX, e.clientY - originY) < 4) return
    moved = true
    store.setAbs(id, {
      x: Math.round(startX + (e.clientX - originX) / store.zoom),
      y: Math.round(startY + (e.clientY - originY) / store.zoom),
    })
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    if (moved) history.commit()
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
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
