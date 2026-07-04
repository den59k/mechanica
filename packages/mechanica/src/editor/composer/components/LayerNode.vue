<template>
  <div
    class="mech-composer__layer"
    :class="{ 'is-selected': store.selectedId === node.id }"
    :style="{ paddingLeft: `${depth * 14 + 8}px` }"
    @click.stop="store.select(node.id)"
  >
    <VIcon :name="icon" class="mech-composer__layer-icon" />
    <span class="mech-composer__layer-label">{{ label }}</span>
    <button
      type="button"
      class="mech-composer__layer-remove"
      title="Delete"
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
import { composerStoreKey } from '../lib/keys'
import { elementMeta, blockLabel } from '../lib/elements-meta'
import VIcon from '../../components/VIcon.vue'

const props = defineProps<{ node: ContentBlock; depth: number }>()
const store = inject(composerStoreKey)!

const icon = computed(() => elementMeta(props.node.blockId)?.icon ?? 'slot')
const label = computed(() => blockLabel(props.node))

// Flatten default-slot array or named-slot lists into a single ordered list.
const children = computed<ContentBlock[]>(() => {
  const c = props.node.children
  if (!c) return []
  return Array.isArray(c) ? c : Object.values(c).flat()
})
</script>
