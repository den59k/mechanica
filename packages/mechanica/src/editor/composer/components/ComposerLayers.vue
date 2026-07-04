<template>
  <div class="mech-composer__layers">
    <div class="mech-composer__section-title">Layers</div>
    <div class="mech-composer__layers-list">
      <LayerNode v-for="node in store.template" :key="node.id" :node="node" :depth="0" />
      <p v-if="!store.template.length" class="mech-composer__layers-empty">No elements yet</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, provide } from 'vue'
import { composerStoreKey, composerLayerDndKey } from '../lib/keys'
import { useLayerDnd } from '../lib/use-layer-dnd'
import { isContainerBlock } from '../lib/elements-meta'
import { findBlock } from '../../lib/content-tree'
import LayerNode from './LayerNode.vue'

const store = inject(composerStoreKey)!

// Container = a frame, or any block that already holds children (a slotted code
// block), so a designer can drop into it.
const isContainer = (id: string): boolean => {
  const node = findBlock(store.template, id)
  return !!node && (isContainerBlock(node.blockId) || node.children != null)
}
provide(composerLayerDndKey, useLayerDnd(store, isContainer))
</script>
