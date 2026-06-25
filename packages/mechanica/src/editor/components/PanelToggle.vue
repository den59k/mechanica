<template>
  <button
    ref="btnEl"
    class="mech-editor__toggle"
    :class="{ 'is-dragging': dragging }"
    type="button"
    tabindex="-1"
    :style="style"
    :title="collapsed ? 'Open editor (Space)' : 'Hide editor (Space)'"
    @click="onClick"
    @pointerdown="onPointerDown"
  >
    <VIcon :name="collapsed ? 'menu' : 'close'" />
  </button>

  <!-- Magnet targets shown while dragging; the nearest one lights up. -->
  <Teleport to="body">
    <div v-if="dragging" class="mech-dock-targets" data-mech-ui aria-hidden="true">
      <span
        v-for="anchor in DOCK_ANCHORS"
        :key="anchor"
        class="mech-dock-target"
        :class="{ 'is-near': anchor === nearest }"
        :style="targetStyle(anchor)"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import VIcon from './VIcon.vue'
import {
  DOCK_ANCHORS,
  anchorCenter,
  anchorPosition,
  isDockAnchor,
  nearestAnchor,
  type DockAnchor,
} from '../lib/panel-dock'

const props = withDefaults(defineProps<{ collapsed: boolean; rightPanel?: number }>(), {
  rightPanel: 300,
})
const emit = defineEmits<{ toggle: [] }>()

const SIZE = 36
const STORAGE_KEY = 'mech-editor-dock'
const DRAG_THRESHOLD = 4

// The open handle clears whichever sidebar is open on each side: the left panel
// (300) and, on the right, the settings panel when a block is selected
// (`rightPanel` = 380) or the palette (300) otherwise.
const metrics = computed(() => ({
  size: SIZE,
  margin: 14,
  leftPanel: 300,
  rightPanel: props.rightPanel,
  gap: 8,
}))

function clamp(value: number, lo: number, hi: number) {
  return Math.min(Math.max(value, lo), Math.max(lo, hi))
}
// Measure the layout viewport without the scrollbar so the handle's right edge
// lines up with the fixed panels (which sit at `right: 0`).
function viewport() {
  const doc = document.documentElement
  return { width: doc.clientWidth || window.innerWidth, height: doc.clientHeight || window.innerHeight }
}
function loadDock(): DockAnchor {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (isDockAnchor(value)) return value
  } catch {
    /* storage unavailable */
  }
  return 'top-center'
}
function saveDock(anchor: DockAnchor) {
  try {
    localStorage.setItem(STORAGE_KEY, anchor)
  } catch {
    /* storage unavailable */
  }
}

const btnEl = ref<HTMLButtonElement | null>(null)
const dock = ref<DockAnchor>(loadDock())
const vp = ref(typeof document !== 'undefined' ? viewport() : { width: 0, height: 0 })
const dragging = ref(false)
const dragPos = ref<{ x: number; y: number } | null>(null)
const nearest = ref<DockAnchor>(dock.value)

let grab = { dx: 0, dy: 0 }
let start = { x: 0, y: 0 }
let suppressClick = false

const readViewport = () => (vp.value = viewport())

// Rests at the docked anchor (which itself shifts inward for side anchors when
// the panels are open); follows the cursor while dragging.
const style = computed(() => {
  const p = dragPos.value ?? anchorPosition(dock.value, props.collapsed, vp.value, metrics.value)
  return { left: `${p.x}px`, top: `${p.y}px` }
})

const targetStyle = (anchor: DockAnchor) => {
  const c = anchorCenter(anchor, props.collapsed, vp.value, metrics.value)
  return { left: `${c.x}px`, top: `${c.y}px` }
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  const rect = btnEl.value!.getBoundingClientRect()
  grab = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
  start = { x: event.clientX, y: event.clientY }
  readViewport()
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}
function onPointerMove(event: PointerEvent) {
  if (!dragging.value) {
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_THRESHOLD) return
    dragging.value = true
  }
  const x = clamp(event.clientX - grab.dx, metrics.value.margin, vp.value.width - SIZE - metrics.value.margin)
  const y = clamp(event.clientY - grab.dy, metrics.value.margin, vp.value.height - SIZE - metrics.value.margin)
  dragPos.value = { x, y }
  nearest.value = nearestAnchor({ x: x + SIZE / 2, y: y + SIZE / 2 }, props.collapsed, vp.value, metrics.value)
}
function onPointerUp() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  if (!dragging.value) return
  dock.value = nearest.value
  saveDock(dock.value)
  dragging.value = false
  dragPos.value = null
  suppressClick = true // swallow the click that fires right after a drag
  btnEl.value?.blur()
}
function onClick() {
  if (suppressClick) {
    suppressClick = false
    return
  }
  emit('toggle')
  btnEl.value?.blur()
}

onMounted(() => {
  readViewport()
  window.addEventListener('resize', readViewport)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', readViewport)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})
</script>
