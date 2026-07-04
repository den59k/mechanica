<template>
  <div class="mech-composer__canvas-scroll">
    <div class="mech-composer__canvas-frame" :style="frameStyle">
      <div
        class="mech-composer__canvas"
        :style="canvasStyle"
        @click.capture="onClick"
      >
        <CanvasContent />
        <div v-if="!store.template.length" class="mech-composer__empty">
          <p>This block is empty.</p>
          <p>Add a Frame or Text from the left to get started.</p>
        </div>
      </div>
    </div>
    <SelectionStyle />
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, inject, type ComputedRef } from 'vue'
import { renderBlocks } from '../../../core/render-blocks'
import type { BlocksMap } from '../../../core/state'
import { composerStoreKey } from '../lib/keys'
import { resolveForCanvas } from '../lib/canvas'

const store = inject(composerStoreKey)!
const blocks = inject<BlocksMap>('composerBlocks')!
const bpWidth = inject<ComputedRef<number>>('composerBreakpointWidth')!

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

const frameStyle = computed(() => ({ width: `${bpWidth.value * store.zoom}px` }))
const canvasStyle = computed(() => ({
  width: `${bpWidth.value}px`,
  transform: `scale(${store.zoom})`,
  transformOrigin: 'top left',
}))

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
</script>
