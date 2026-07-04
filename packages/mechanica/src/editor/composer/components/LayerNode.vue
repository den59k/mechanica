<template>
  <div
    class="mech-composer__layer"
    :class="{
      'is-selected': store.selectedId === node.id,
      'is-dragging': dnd.dragId === node.id,
      'drop-before': dropPos === 'before',
      'drop-after': dropPos === 'after',
      'drop-inside': dropPos === 'inside',
    }"
    :style="{ paddingLeft: `${depth * 14 + 8}px` }"
    :data-layer-id="node.id"
    @pointerdown="dnd.arm(node.id, $event)"
    @click.stop="onClick"
  >
    <VIcon :name="icon" class="mech-composer__layer-icon" />
    <span class="mech-composer__layer-label">{{ label }}</span>
    <button
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
import type { ContentBlock } from 'mechanica-shared'
import { composerStoreKey, composerLayerDndKey } from '../lib/keys'
import { elementMeta, blockLabel } from '../lib/elements-meta'
import VIcon from '../../components/VIcon.vue'

const props = defineProps<{ node: ContentBlock; depth: number }>()
const store = inject(composerStoreKey)!
const dnd = inject(composerLayerDndKey)!

const icon = computed(() => elementMeta(props.node.blockId)?.icon ?? 'slot')
const label = computed(() => blockLabel(props.node))
const dropPos = computed(() => (dnd.target?.id === props.node.id ? dnd.target.position : null))

// A drag ending over this row should not also select it.
const onClick = () => {
  if (!dnd.suppressClick) store.select(props.node.id)
}

// Flatten default-slot array or named-slot lists into a single ordered list.
const children = computed<ContentBlock[]>(() => {
  const c = props.node.children
  if (!c) return []
  return Array.isArray(c) ? c : Object.values(c).flat()
})
</script>
