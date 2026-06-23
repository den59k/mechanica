<template>
  <ul class="mech-tree">
    <li v-for="block in items" :key="block.id" class="mech-tree__node">
      <div
        class="mech-tree__row"
        :class="{ 'is-selected': store.selectedId === block.id }"
        @click.stop="store.select(block.id)"
      >
        <span class="mech-tree__label">{{ labelOf(block) }}</span>
        <span class="mech-tree__actions">
          <button type="button" title="Move up" @click.stop="store.move(block.id, -1)">↑</button>
          <button type="button" title="Move down" @click.stop="store.move(block.id, 1)">↓</button>
          <button type="button" title="Delete" @click.stop="store.remove(block.id)">×</button>
        </span>
      </div>
      <HierarchyTree v-if="childrenOf(block).length" :blocks="childrenOf(block)" />
    </li>
  </ul>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import type { ContentBlock } from '@mechanica/shared'
import { editorStoreKey } from './store'

const props = defineProps<{ blocks?: ContentBlock[] }>()
const store = inject(editorStoreKey)!
const items = props.blocks ?? store.content

const labelOf = (block: ContentBlock) => store.blocksById.get(block.blockId)?.name ?? block.blockId
const childrenOf = (block: ContentBlock): ContentBlock[] => {
  if (!block.children) return []
  return Array.isArray(block.children) ? block.children : Object.values(block.children).flat()
}
</script>
