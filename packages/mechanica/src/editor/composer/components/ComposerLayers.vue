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
import { inject } from 'vue'
import { composerStoreKey } from '../lib/keys'
import LayerNode from './LayerNode.vue'

const store = inject(composerStoreKey)!
</script>
