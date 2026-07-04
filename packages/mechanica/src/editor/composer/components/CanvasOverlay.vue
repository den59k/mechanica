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
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { composerStoreKey, composerHistoryKey } from '../lib/keys'
import { elementKind, blockLabel } from '../lib/elements-meta'
import { HANDLES, handlePoint, handleAxes, handleCursor, resizeSize, type Box, type Handle } from '../lib/canvas-overlay'

const props = defineProps<{ hoverId: string | null }>()
const store = inject(composerStoreKey)!
const history = inject(composerHistoryKey)!

const selBoxes = ref<Box[]>([])
const hoverBox = ref<Box | null>(null)

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
    store.setData(id, size, { responsive: true })
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
  ro?.disconnect()
  store.measured = null
})
</script>
