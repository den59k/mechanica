<template>
  <div class="mech-composer__overlay" aria-hidden="true">
    <!-- Hover outline (skipped when it's the current selection). -->
    <div v-if="hoverBox && hoverId !== store.selectedId" class="mech-composer__hover" :style="boxStyle(hoverBox)" />

    <template v-if="selBox">
      <!-- Frame label above a selected container. -->
      <div v-if="isFrame" class="mech-composer__frame-label" :style="{ left: `${selBox.left}px`, top: `${selBox.top - 20}px` }">
        {{ selLabel }}
      </div>
      <div class="mech-composer__selbox" :style="boxStyle(selBox)" />
      <div class="mech-composer__sizebadge" :style="{ left: `${selBox.left + selBox.width / 2}px`, top: `${selBox.top + selBox.height + 8}px` }">
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

const selBox = ref<Box | null>(null)
const hoverBox = ref<Box | null>(null)

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
  const selEl = blockEl(store.selectedId)
  selBox.value = selEl ? toBox(selEl) : null
  // Publish the world-pixel size so the inspector's SizeInput shows real dims.
  if (selEl) {
    const r = selEl.getBoundingClientRect()
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
  const p = handlePoint(selBox.value!, handle)
  return { left: `${p.x}px`, top: `${p.y}px`, cursor: handleCursor(handle) }
}

// ── Resize ───────────────────────────────────────────────────────────────────
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
  () => store.selectedId,
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
