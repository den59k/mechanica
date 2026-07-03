<template>
  <Teleport to="body">
    <div class="mech-bp" data-mech-ui :style="boxStyle">
      <!-- The block renders at a real page width, then the whole stage is scaled
           down to thumbnail size. overflow:hidden clips to the top of the block. -->
      <div ref="stageEl" class="mech-bp__stage" :style="stageStyle"></div>
      <div v-if="failed" class="mech-bp__fallback">
        <VIcon v-if="block.icon" :name="block.icon" />
        <span v-else class="mech-bp__mono">{{ monogram }}</span>
        <span class="mech-bp__name">{{ block.name }}</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Block } from 'mechanica-shared'
import type { BlocksMap } from '../../core/state'
import { mountBlockPreview, type BlockPreviewHandle } from '../lib/block-preview'
import VIcon from './VIcon.vue'

const props = defineProps<{
  block: Block
  /** The available block components (`store.componentsById`). */
  blocks: BlocksMap
  /** The hovered card's viewport rect; the popover sits to its left. */
  anchor: { top: number; left: number; height: number }
}>()

const DESIGN_WIDTH = 1200 // render the block at a real page width, then scale
const WIDTH = 360
const SCALE = WIDTH / DESIGN_WIDTH
const MIN_H = 88
const MAX_H = 320
const GAP = 12

const stageEl = ref<HTMLElement | null>(null)
const failed = ref(false)
const naturalHeight = ref(240)
let handle: BlockPreviewHandle | null = null

const monogram = computed(() => props.block.name.charAt(0).toUpperCase())

const height = computed(() =>
  Math.min(MAX_H, Math.max(MIN_H, Math.round(naturalHeight.value * SCALE))),
)

const stageStyle = {
  width: `${DESIGN_WIDTH}px`,
  transform: `scale(${SCALE})`,
  transformOrigin: 'top left',
}

// Fixed-position to the left of the hovered card, vertically centred on it and
// clamped to the viewport. Driven by `height` so it recentres once measured.
const boxStyle = computed(() => {
  const top = Math.min(
    Math.max(8, props.anchor.top + props.anchor.height / 2 - height.value / 2),
    window.innerHeight - height.value - 8,
  )
  const left = Math.max(8, props.anchor.left - GAP - WIDTH)
  return { width: `${WIDTH}px`, height: `${height.value}px`, transform: `translate(${left}px, ${top}px)` }
})

onMounted(() => {
  const el = stageEl.value
  if (!el) return
  handle = mountBlockPreview(
    el,
    { blocks: props.blocks, blockId: props.block.id },
    () => (failed.value = true),
  )
  // Measure the block's natural (unscaled) height once it has painted, so the
  // popover can size snugly. scrollHeight ignores the CSS transform.
  void nextTick(() =>
    requestAnimationFrame(() => {
      if (!failed.value && el.scrollHeight) naturalHeight.value = el.scrollHeight
    }),
  )
})

onBeforeUnmount(() => handle?.destroy())
</script>

<style lang="scss" scoped>
.mech-bp {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483400;
  overflow: hidden;
  background: var(--mech-bg);
  border: 1px solid var(--mech-border);
  border-radius: var(--mech-radius);
  box-shadow: var(--mech-shadow-pop);
  pointer-events: none; // never steal the hover from the card driving it
  font-family: var(--mech-font);
  color: var(--mech-fg);
}
.mech-bp__stage {
  // width / transform set inline; content is clipped by the box's overflow.
}
.mech-bp__fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--mech-muted);

  .vicon {
    width: 26px;
    height: 26px;
  }
}
.mech-bp__mono {
  font-size: 24px;
  font-weight: 600;
}
.mech-bp__name {
  font-size: 12.5px;
  font-weight: 500;
}
</style>
