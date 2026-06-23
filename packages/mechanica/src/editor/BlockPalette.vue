<template>
  <div class="mech-palette">
    <input
      class="mech-input mech-palette__search"
      :value="search"
      placeholder="Search blocks…"
      @input="search = ($event.target as HTMLInputElement).value"
    />

    <div v-for="group in groups" :key="group.name" class="mech-palette__group">
      <div v-if="group.name" class="mech-palette__group-title">{{ group.name }}</div>
      <button
        v-for="block in group.blocks"
        :key="block.id"
        type="button"
        class="mech-palette__item"
        :title="block.description"
        @pointerdown="
          drag.begin({ kind: 'new', blockId: block.id, label: block.name }, $event, () =>
            store.addBlock(block.id),
          )
        "
      >
        {{ block.name }}
      </button>
    </div>

    <p v-if="!groups.length" class="mech-tree__empty">No blocks match “{{ search }}”.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useSearch } from 'vuesix'
import type { Block } from '@mechanica/shared'
import { editorStoreKey } from './store'
import { dragKey } from './drag-controller'

const store = inject(editorStoreKey)!
const drag = inject(dragKey)!
const search = ref('')

const filtered = useSearch(
  search,
  () => store.blocks,
  (block: Block) => `${block.name} ${block.category ?? ''}`,
)

const groups = computed(() => {
  const byCategory = new Map<string, Block[]>()
  for (const block of filtered.value) {
    const category = block.category ?? ''
    if (!byCategory.has(category)) byCategory.set(category, [])
    byCategory.get(category)!.push(block)
  }
  return [...byCategory.entries()].map(([name, blocks]) => ({ name, blocks }))
})
</script>
