<template>
  <div class="mech-composer__overlay" aria-hidden="true">
    <!-- Hover outline (skipped when the hovered element is already selected). -->
    <div
      v-if="hoverBox && hoverId && !store.isSelected(hoverId)"
      class="mech-composer__hover"
      :style="boxStyle(hoverBox)"
    />

    <!-- A thin frame around every selected element. -->
    <div v-for="(box, i) in selBoxes" :key="i" class="mech-composer__selbox" :style="boxStyle(box)" />

    <!-- Multi-select: a dashed box around the whole group. -->
    <div v-if="unionBox" class="mech-composer__multibox" :style="boxStyle(unionBox)" />

    <!-- Single select: frame label, size badge, and resize handles on the primary. -->
    <template v-if="single && primaryBox">
      <!-- Padding-drag strips (under the handles). -->
      <div
        v-for="p in padStrips"
        :key="'pad' + p.side"
        class="mech-composer__pad-strip"
        :class="[`is-${p.side}`, { 'is-active': padDragging === p.side }]"
        :style="boxStyle(p.box)"
        :title="`Padding ${padSideValue(p.side)}`"
        @pointerdown.stop.prevent="startPadDrag(p.side, $event)"
      >
        <span class="mech-composer__space-label">{{ padSideValue(p.side) }}</span>
      </div>
      <div
        v-if="isFrame"
        class="mech-composer__frame-label"
        :style="{ left: `${primaryBox.left}px`, top: `${primaryBox.top - 20}px` }"
      >
        {{ selLabel }}
      </div>
      <div
        class="mech-composer__sizebadge"
        :style="{ left: `${primaryBox.left + primaryBox.width / 2}px`, top: `${primaryBox.top + primaryBox.height + 8}px` }"
      >
        {{ sizeBadge }}
      </div>
      <button
        v-for="h in HANDLES"
        :key="h"
        type="button"
        class="mech-composer__handle"
        :style="handleStyle(h)"
        :title="`Resize`"
        @pointerdown.stop.prevent="startResize(h, $event)"
        @dblclick.stop="resetAxis(h)"
        @click.stop
      />

      <!-- Gap-drag strips between a frame's flow children. -->
      <div
        v-for="(g, i) in gapBoxes"
        :key="'gap' + i"
        class="mech-composer__gap"
        :class="[gapAxis === 'x' ? 'is-col' : 'is-row', { 'is-active': gapDragging }]"
        :style="boxStyle(g)"
        :title="`Gap ${gapValue}`"
        @pointerdown.stop.prevent="startGapDrag($event)"
      >
        <span class="mech-composer__space-label">{{ gapValue }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { composerStoreKey, composerHistoryKey } from '../lib/keys'
import { elementKind, blockLabel } from '../lib/elements-meta'
import { HANDLES, handlePoint, handleAxes, handleCursor, resizeSize, gapStrips, paddingStrips, snapTo, type Box, type Handle, type Side } from '../lib/canvas-overlay'
import { parsePadding, collapsePadding, computePaddingDrag } from '../lib/padding'

const props = defineProps<{ hoverId: string | null }>()
const store = inject(composerStoreKey)!
const history = inject(composerHistoryKey)!

const selBoxes = ref<Box[]>([])
const hoverBox = ref<Box | null>(null)
const gapBoxes = ref<Box[]>([])
const gapAxis = ref<'x' | 'y'>('y')
const gapDragging = ref(false)
const GAP_HIT = 9 // strip thickness (screen px)

const gapValue = computed(() => {
  const f = store.selected
  return f ? Number(store.effective(f, 'gap')) || 0 : 0
})

const padStrips = ref<{ side: Side; box: Box }[]>([])
const padDragging = ref<Side | null>(null)
const PAD_MIN = 6 // minimum grab thickness (screen px) so 0 padding is draggable
const SNAP = 4 // Shift-drag snaps gap / padding / size to this grid
const PAD_AXIS: Record<Side, 'x' | 'y'> = { t: 'y', b: 'y', l: 'x', r: 'x' }

/**
 * Which pointer direction grows a side's padding. The strip should follow the
 * cursor: the start sides (top / left) always grow toward +. The end sides
 * (bottom / right) grow toward + when the frame *hugs* that axis (adding padding
 * pushes the far edge out with the cursor) but toward − when it *fills / is fixed*
 * (the edge is pinned, so content shrinks inward against the cursor).
 */
function padSign(side: Side): 1 | -1 {
  if (side === 't' || side === 'l') return 1
  const frame = store.selected
  const size = frame ? store.effective(frame, side === 'b' ? 'h' : 'w') : undefined
  return size == null ? 1 : -1 // undefined → hug; a number (fixed) or 'fill' → pinned edge
}
const padSideValue = (side: Side) => {
  const f = store.selected
  return f ? parsePadding(store.effective(f, 'padding'))[side] : 0
}

const single = computed(() => store.selectedIds.length === 1)
const primaryBox = computed(() => selBoxes.value[selBoxes.value.length - 1] ?? null)
const unionBox = computed(() => (store.selectedIds.length > 1 ? union(selBoxes.value) : null))

const selectedNode = computed(() => store.selected)
const isFrame = computed(() => selectedNode.value != null && elementKind(selectedNode.value.blockId) === 'frame')
const selLabel = computed(() =>
  selectedNode.value
    ? selectedNode.value.id === store.rootId
      ? store.def.name || 'Block'
      : blockLabel(selectedNode.value)
    : '',
)
const sizeBadge = computed(() => {
  const m = store.measured
  return m ? `${m.w} × ${m.h}` : ''
})

/** Bounding box enclosing every selected element. */
function union(boxes: Box[]): Box | null {
  if (!boxes.length) return null
  let l = Infinity
  let t = Infinity
  let r = -Infinity
  let b = -Infinity
  for (const box of boxes) {
    l = Math.min(l, box.left)
    t = Math.min(t, box.top)
    r = Math.max(r, box.left + box.width)
    b = Math.max(b, box.top + box.height)
  }
  return { left: l, top: t, width: r - l, height: b - t }
}

// ── Measurement ──────────────────────────────────────────────────────────────
const viewport = () => document.querySelector('.mech-composer__viewport') as HTMLElement | null
const blockEl = (id: string | null) =>
  id ? (viewport()?.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null) : null

function measure(): void {
  const vp = viewport()
  if (!vp) return
  const vpr = vp.getBoundingClientRect()
  const toBox = (el: HTMLElement): Box => {
    const r = el.getBoundingClientRect()
    return { left: r.left - vpr.left, top: r.top - vpr.top, width: r.width, height: r.height }
  }
  const boxes: Box[] = []
  for (const id of store.selectedIds) {
    const el = blockEl(id)
    if (el) boxes.push(toBox(el))
  }
  selBoxes.value = boxes
  // Publish the world-pixel size for the inspector's SizeInput — only when a
  // single element is selected (the inspector is a per-element form).
  const primaryEl = single.value ? blockEl(store.selectedId) : null
  if (primaryEl) {
    const r = primaryEl.getBoundingClientRect()
    store.measured = { w: Math.round(r.width / store.zoom), h: Math.round(r.height / store.zoom) }
  } else {
    store.measured = null
  }
  const hovEl = blockEl(props.hoverId)
  hoverBox.value = hovEl ? toBox(hovEl) : null

  // Gap strips: only for a single selected frame laid out in flow (no wrap, not
  // space-between) with ≥2 in-flow children.
  gapBoxes.value = []
  const frame = single.value ? store.selected : null
  if (frame && elementKind(frame.blockId) === 'frame' && !store.effective(frame, 'wrap') && store.effective(frame, 'justify') !== 'between') {
    const axis = store.effective(frame, 'direction') === 'row' ? 'x' : 'y'
    const children = (Array.isArray(frame.children) ? frame.children : []).filter((c) => !c.data.$abs)
    const boxes: Box[] = []
    for (const child of children) {
      const el = blockEl(child.id)
      if (el) boxes.push(toBox(el))
    }
    if (boxes.length >= 2) {
      gapAxis.value = axis
      gapBoxes.value = gapStrips(boxes, axis, GAP_HIT)
    }
  }

  // Padding strips: the four inset regions of a selected frame.
  padStrips.value = []
  if (frame && elementKind(frame.blockId) === 'frame') {
    const el = blockEl(frame.id)
    if (el) {
      const cs = getComputedStyle(el)
      const z = store.zoom
      const pad = {
        t: parseFloat(cs.paddingTop) * z,
        r: parseFloat(cs.paddingRight) * z,
        b: parseFloat(cs.paddingBottom) * z,
        l: parseFloat(cs.paddingLeft) * z,
      }
      padStrips.value = paddingStrips(toBox(el), pad, PAD_MIN).filter((s) => s.box.width > 0 && s.box.height > 0)
    }
  }
}
const remeasure = () => nextTick(measure)

// ── Rendering helpers ────────────────────────────────────────────────────────
const boxStyle = (box: Box) => ({
  left: `${box.left}px`,
  top: `${box.top}px`,
  width: `${box.width}px`,
  height: `${box.height}px`,
})
function handleStyle(handle: Handle) {
  const p = handlePoint(primaryBox.value!, handle)
  return { left: `${p.x}px`, top: `${p.y}px`, cursor: handleCursor(handle) }
}

// ── Resize (single selection only) ─────────────────────────────────────────────
let raf = 0
function startResize(handle: Handle, event: PointerEvent) {
  const id = store.selectedId
  const m = store.measured
  if (!id || !m) return
  const start = { w: m.w, h: m.h }
  const startX = event.clientX
  const startY = event.clientY

  const loop = () => {
    measure()
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)

  const onMove = (e: PointerEvent) => {
    const size = resizeSize(start, handle, e.clientX - startX, e.clientY - startY, store.zoom)
    let { w, h } = size
    // Alt: edit both axes — grow the un-driven axis by the driven axis's delta.
    if (e.altKey) {
      if (w != null && h == null) h = Math.max(8, start.h + (w - start.w))
      else if (h != null && w == null) w = Math.max(8, start.w + (h - start.h))
    }
    // Shift: snap each driven dimension to the grid.
    if (e.shiftKey) {
      if (w != null) w = Math.max(8, snapTo(w, SNAP))
      if (h != null) h = Math.max(8, snapTo(h, SNAP))
    }
    const patch: Record<string, number> = {}
    if (w != null) patch.w = w
    if (h != null) patch.h = h
    store.setData(id, patch, { responsive: true })
  }
  const onUp = () => {
    cancelAnimationFrame(raf)
    raf = 0
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    history.commit() // coalesce the whole drag into one undo entry
    remeasure()
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
// ── Gap drag (drag the strip between two flow children to set the frame gap) ────
let gapRaf = 0
function startGapDrag(event: PointerEvent) {
  const id = store.selectedId
  const frame = store.selected
  if (!id || !frame) return
  const axis = gapAxis.value
  const startGap = Number(store.effective(frame, 'gap')) || 0
  const startPos = axis === 'x' ? event.clientX : event.clientY
  gapDragging.value = true

  const loop = () => {
    measure()
    gapRaf = requestAnimationFrame(loop)
  }
  gapRaf = requestAnimationFrame(loop)

  const onMove = (e: PointerEvent) => {
    const pos = axis === 'x' ? e.clientX : e.clientY
    const raw = startGap + (pos - startPos) / store.zoom
    const gap = Math.max(0, e.shiftKey ? snapTo(raw, SNAP) : Math.round(raw))
    store.setData(id, { gap }, { responsive: true })
  }
  const onUp = () => {
    cancelAnimationFrame(gapRaf)
    gapRaf = 0
    gapDragging.value = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    history.commit()
    remeasure()
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

// ── Padding drag (drag a side's inset region to change that side's padding) ─────
let padRaf = 0
function startPadDrag(side: Side, event: PointerEvent) {
  const id = store.selectedId
  const frame = store.selected
  if (!id || !frame) return
  const axis = PAD_AXIS[side]
  const sign = padSign(side)
  const startSides = parsePadding(store.effective(frame, 'padding'))
  const startPos = axis === 'x' ? event.clientX : event.clientY
  padDragging.value = side

  const loop = () => {
    measure()
    padRaf = requestAnimationFrame(loop)
  }
  padRaf = requestAnimationFrame(loop)

  const onMove = (e: PointerEvent) => {
    const pos = axis === 'x' ? e.clientX : e.clientY
    const delta = (sign * (pos - startPos)) / store.zoom
    // Alt edits both axes (all four sides); Shift snaps to the grid.
    const sides = computePaddingDrag(startSides, side, delta, { allAxes: e.altKey, snap: e.shiftKey ? SNAP : 0 })
    store.setData(id, { padding: collapsePadding(sides) }, { responsive: true })
  }
  const onUp = () => {
    cancelAnimationFrame(padRaf)
    padRaf = 0
    padDragging.value = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    history.commit()
    remeasure()
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

/** Double-click a handle → reset the axis it drives back to Hug. */
function resetAxis(handle: Handle) {
  const id = store.selectedId
  if (!id) return
  const { sx, sy } = handleAxes(handle)
  const patch: Record<string, unknown> = {}
  if (sx !== 0) patch.w = undefined
  if (sy !== 0) patch.h = undefined
  store.setData(id, patch, { responsive: true })
}

// ── Re-measure triggers ──────────────────────────────────────────────────────
let ro: ResizeObserver | null = null
function observeSelected() {
  ro?.disconnect()
  const el = blockEl(store.selectedId)
  if (el && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => measure())
    ro.observe(el)
  }
}

watch(() => store.def, remeasure, { deep: true })
watch(() => [store.zoom, store.panX, store.panY], measure)
watch(() => store.breakpoint, remeasure)
watch(
  () => store.selectedIds,
  () => {
    remeasure()
    nextTick(observeSelected)
  },
)
watch(() => props.hoverId, measure)

onMounted(() => {
  measure()
  observeSelected()
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (gapRaf) cancelAnimationFrame(gapRaf)
  if (padRaf) cancelAnimationFrame(padRaf)
  ro?.disconnect()
  store.measured = null
})
</script>
