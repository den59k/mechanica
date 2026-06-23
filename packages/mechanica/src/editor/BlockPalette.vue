<template>
  <div class="mech-palette">
    <div v-for="group in groups" :key="group.name" class="mech-palette__group">
      <div v-if="group.name" class="mech-palette__group-title">{{ group.name }}</div>
      <button
        v-for="block in group.blocks"
        :key="block.id"
        type="button"
        class="mech-palette__item"
        :title="block.description"
        @click="store.addBlock(block.id)"
      >
        {{ block.name }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { Block } from '@mechanica/shared'
import { editorStoreKey } from './store'

const store = inject(editorStoreKey)!

const groups = computed(() => {
  const byCategory = new Map<string, Block[]>()
  for (const block of store.blocks) {
    const category = block.category ?? ''
    if (!byCategory.has(category)) byCategory.set(category, [])
    byCategory.get(category)!.push(block)
  }
  return [...byCategory.entries()].map(([name, blocks]) => ({ name, blocks }))
})
</script>
