<template>
  <div
    class="mech-composer__layer"
    :class="{
      'is-selected': store.isSelected(node.id),
      'is-dragging': dnd.dragId === node.id,
      'is-hidden': hidden,
      'drop-before': dropPos === 'before',
      'drop-after': dropPos === 'after',
      'drop-inside': dropPos === 'inside',
    }"
    :style="{ paddingLeft: `${depth * 14 + 8}px` }"
    :data-layer-id="node.id"
    @pointerdown="isRoot || dnd.arm(node.id, $event)"
    @click.stop="onClick"
  >
    <VIcon :name="icon" class="mech-composer__layer-icon" />
    <span class="mech-composer__layer-label">{{ label }}</span>
    <VIcon v-if="repeats" name="repeat" class="mech-composer__layer-badge" title="Repeats per item" />
    <!-- A hidden element is invisible on canvas — the tree is where it stays
         reachable, so the eye toggle lives here (visible while hidden). -->
    <button
      v-if="hidden"
      type="button"
      class="mech-composer__layer-eye"
      :title="`Hidden${store.breakpoint === 'base' ? '' : ` on ${store.breakpoint}`} — click to show`"
      @pointerdown.stop
      @click.stop="unhide"
    >
      <VIcon name="eye-off" />
    </button>
    <button
      v-if="!isRoot"
      type="button"
      class="mech-composer__layer-remove"
      title="Delete"
      @pointerdown.stop
      @click.stop="store.remove(node.id)"
    >
      <VIcon name="trash" />
    </button>
  </div>
  <LayerNode v-for="child in children" :key="child.id" :node="child" :depth="depth + 1" />
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { Block, ContentBlock } from 'mechanica-shared'
import { composerStoreKey, composerLayerDndKey } from '../lib/keys'
import { blockIcon, blockLabel, elementKind } from '../lib/elements-meta'
import { effectiveData } from '../lib/canvas'
import VIcon from '../../components/VIcon.vue'

const props = defineProps<{ node: ContentBlock; depth: number }>()
const store = inject(composerStoreKey)!
const dnd = inject(composerLayerDndKey)!
const codeBlocks = inject<Block[]>('composerCodeBlocks', [])

// A placed site component (button/badge/card) is labelled by its manifest name.
const component = computed(() =>
  elementKind(props.node.blockId) ? null : codeBlocks.find((b) => b.id === props.node.blockId) ?? null,
)
// The root frame is labelled with the block's name (it *is* the block).
const isRoot = computed(() => props.node.id === store.rootId)
const icon = computed(() => component.value?.icon ?? blockIcon(props.node))
const label = computed(() =>
  isRoot.value ? store.def.name || 'Block' : component.value?.name ?? blockLabel(props.node),
)
const dropPos = computed(() => (dnd.target?.id === props.node.id ? dnd.target.position : null))

// Hidden at the breakpoint the canvas previews (the `hide` knob) — the row dims
// and grows an eye toggle, since the canvas shows nothing to click.
const hidden = computed(() => effectiveData(props.node, store.breakpoint).hide === true)
const repeats = computed(() => !!store.eachPropOf(props.node))
const unhide = () => {
  // At base, "shown" is the default — drop the key; at a breakpoint write the
  // explicit un-hide override.
  if (store.breakpoint === 'base') store.setData(props.node.id, { hide: undefined })
  else store.setData(props.node.id, { hide: false }, { responsive: true })
}

// A drag ending over this row should not also select it. Shift/Ctrl/Cmd add the
// row to a multi-selection.
const onClick = (event: MouseEvent) => {
  if (dnd.suppressClick) return
  store.select(props.node.id, event.shiftKey || event.metaKey || event.ctrlKey)
}

// Flatten default-slot array or named-slot lists into a single ordered list.
const children = computed<ContentBlock[]>(() => {
  const c = props.node.children
  if (!c) return []
  return Array.isArray(c) ? c : Object.values(c).flat()
})
</script>
