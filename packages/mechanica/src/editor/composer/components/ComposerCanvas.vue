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
    <!-- The world is the artboard: its width is the device width and the root
         frame (w: fill) fills it, so the root block itself is the visible surface
         — no separate canvas underlay. -->
    <div
      ref="worldEl"
      class="mech-composer__world"
      :class="{ 'is-editing': !!editingId }"
      :style="worldStyle"
      @click.capture="onClick"
      @dblclick="onCanvasDblClick"
    >
      <CanvasContent />
      <div v-if="isEmpty" class="mech-composer__empty">
        <p>This block is empty.</p>
        <p>Drag a Row, Column, or Text from the left — or click one — to get started.</p>
      </div>
    </div>
    <CanvasOverlay :hover-id="hoverId" />

    <!-- Rubber-band selection box (viewport-local coords). -->
    <div v-if="marquee" class="mech-composer__marquee" :style="marqueeStyle" />

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
import { computed, defineComponent, inject, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComputedRef } from 'vue'
import { isBinding, type ContentBlock } from 'mechanica-shared'
import { renderBlocks } from '../../../core/render-blocks'
import type { BlocksMap } from '../../../core/state'
import { composerStoreKey, composerInsertDndKey, composerHistoryKey } from '../lib/keys'
import { findBlock } from '../../lib/content-tree'
import { blockLabel, elementKind } from '../lib/elements-meta'
import { resolveForCanvas } from '../lib/canvas'
import { zoomAround, fitView, wheelZoomFactor, type View } from '../lib/canvas-view'
import { marqueeRect, rectsIntersect } from '../lib/marquee'
import { anchorSigns } from '../lib/abs'
import type { Box } from '../lib/canvas-overlay'
import CanvasOverlay from './CanvasOverlay.vue'

const store = inject(composerStoreKey)!
const insert = inject(composerInsertDndKey)!
const history = inject(composerHistoryKey)!
const blocks = inject<BlocksMap>('composerBlocks')!
const bpWidth = inject<ComputedRef<number>>('composerBreakpointWidth')!

const hoverId = ref<string | null>(null)
const editingId = ref<string | null>(null)

const viewportEl = ref<HTMLElement>()
const worldEl = ref<HTMLElement>()

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

// ── View: pan + zoom, applied as one world transform. The world's width is the
// device width — the artboard — so the root frame (w: fill) spans it. ──────────
const worldStyle = computed(() => ({
  transform: `translate(${store.panX}px, ${store.panY}px) scale(${store.zoom})`,
  transformOrigin: '0 0',
  width: `${bpWidth.value}px`,
}))

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
  const height = worldEl.value?.offsetHeight ?? 400
  applyView(fitView(rect.width, rect.height, bpWidth.value, height))
}

// ── Pointer interactions: pan (middle) / select · drag · marquee (left) ────────
const panning = ref(false)
let panStart: { x: number; y: number; panX: number; panY: number } | null = null
const marquee = ref<Box | null>(null) // viewport-local rubber-band box
const marqueeStyle = computed(() => ({
  left: `${marquee.value!.left}px`,
  top: `${marquee.value!.top}px`,
  width: `${marquee.value!.width}px`,
  height: `${marquee.value!.height}px`,
}))

function onPointerDown(event: PointerEvent) {
  if (event.button === 1) return startPan(event) // middle button pans
  if (event.button !== 0 || editingId.value) return
  // The floating zoom bar lives inside the viewport — don't treat its clicks as canvas.
  if ((event.target as HTMLElement).closest('.mech-composer__zoombar')) return
  const el = (event.target as HTMLElement).closest('[data-block-id]') as HTMLElement | null
  const id = el?.getAttribute('data-block-id') ?? null
  const additive = event.shiftKey || event.metaKey || event.ctrlKey

  // Empty space (grey viewport or the root frame's own area) → rubber-band select.
  if (!id || id === store.rootId) return beginMarquee(event, id, additive)

  // Additive click toggles membership without starting a drag.
  if (additive) return store.select(id, true)

  // Grabbing one of several selected elements keeps the group (for a group drag);
  // otherwise select just this element.
  const grabbingGroup = store.isSelected(id) && store.selectedIds.length > 1
  if (!grabbingGroup) store.select(id)

  const nodes = store.selectedNodes
  const allAbs = nodes.length > 0 && nodes.every((n) => !!n.data.$abs)
  if (grabbingGroup && allAbs) return startGroupAbsDrag(event)
  if (grabbingGroup) store.select(id) // mixed selection → collapse to the grabbed one

  if (id === store.rootId) return
  const node = findBlock(store.template, id)
  if (!node) return
  if (node.data.$abs) startAbsDrag(id, node, event)
  else insert.armMove(id, blockLabel(node), event)
}

// ── Click: block link navigation; selection already happened on pointerdown ────
function onClick(event: MouseEvent) {
  if (editingId.value) return // let clicks place the caret while editing text
  if ((event.target as HTMLElement).closest('[data-block-id]')) {
    event.preventDefault()
    event.stopPropagation()
  }
}

// ── Pan (middle mouse) ─────────────────────────────────────────────────────────
function startPan(event: PointerEvent) {
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

// ── Marquee (rubber-band) selection ────────────────────────────────────────────
function beginMarquee(event: PointerEvent, pressedId: string | null, additive: boolean) {
  const startX = event.clientX
  const startY = event.clientY
  const base = additive ? [...store.selectedIds] : []
  let moved = false
  const onMove = (e: PointerEvent) => {
    if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return
    moved = true
    const rect = marqueeRect(startX, startY, e.clientX, e.clientY)
    const vpr = viewportEl.value!.getBoundingClientRect()
    marquee.value = { left: rect.left - vpr.left, top: rect.top - vpr.top, width: rect.width, height: rect.height }
    store.selectMany(collectMarqueeHits(rect, base))
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    marquee.value = null
    if (!moved) {
      // A plain click on empty space: select the root frame, or clear.
      if (pressedId === store.rootId) store.select(store.rootId)
      else if (!additive) store.select(null)
    }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

/** Every element (never the root) whose box intersects the marquee, unioned with `base`. */
function collectMarqueeHits(rect: Box, base: string[]): string[] {
  const world = worldEl.value
  if (!world) return base
  const ids = new Set(base)
  for (const el of world.querySelectorAll<HTMLElement>('[data-block-id]')) {
    const id = el.getAttribute('data-block-id')!
    if (id === store.rootId) continue // the marquee selects children, not the whole block
    const r = el.getBoundingClientRect()
    if (rectsIntersect(rect, { left: r.left, top: r.top, width: r.width, height: r.height })) ids.add(id)
  }
  return [...ids]
}

// ── Hover highlight ───────────────────────────────────────────────────────────
function onHoverMove(event: PointerEvent) {
  if (insert.dragging || panning.value || editingId.value || marquee.value) {
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
/** Free-drag an absolutely-placed child inside its parent (writes `$abs.x/y`). */
function startAbsDrag(id: string, node: ContentBlock, event: PointerEvent) {
  const abs = (node.data.$abs ?? {}) as Record<string, unknown>
  const startX = typeof abs.x === 'number' ? abs.x : 0
  const startY = typeof abs.y === 'number' ? abs.y : 0
  // A right-/bottom-pinned offset grows away from the pointer, so invert that axis.
  const { sx, sy } = anchorSigns(typeof abs.anchor === 'string' ? abs.anchor : 'top-left')
  const originX = event.clientX
  const originY = event.clientY
  let moved = false
  const onMove = (e: PointerEvent) => {
    if (!moved && Math.hypot(e.clientX - originX, e.clientY - originY) < 4) return
    moved = true
    store.setAbs(id, {
      x: Math.round(startX + (sx * (e.clientX - originX)) / store.zoom),
      y: Math.round(startY + (sy * (e.clientY - originY)) / store.zoom),
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

/** Free-drag a whole selection of absolute elements together (same delta each). */
function startGroupAbsDrag(event: PointerEvent) {
  const starts = store.selectedNodes
    .filter((n) => n.data.$abs)
    .map((n) => {
      const abs = n.data.$abs as Record<string, unknown>
      const { sx, sy } = anchorSigns(typeof abs.anchor === 'string' ? abs.anchor : 'top-left')
      return { id: n.id, x: typeof abs.x === 'number' ? abs.x : 0, y: typeof abs.y === 'number' ? abs.y : 0, sx, sy }
    })
  const originX = event.clientX
  const originY = event.clientY
  let moved = false
  const onMove = (e: PointerEvent) => {
    if (!moved && Math.hypot(e.clientX - originX, e.clientY - originY) < 4) return
    moved = true
    const dx = (e.clientX - originX) / store.zoom
    const dy = (e.clientY - originY) / store.zoom
    // Each element inverts per its own anchor (a mixed selection can differ).
    for (const s of starts) store.setAbs(s.id, { x: Math.round(s.x + s.sx * dx), y: Math.round(s.y + s.sy * dy) })
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
// Switching device changes the canvas width drastically — re-fit so the frame
// is centered and fully visible in the new size.
watch(bpWidth, () => nextTick(fit))
onBeforeUnmount(onPanUp)
</script>
