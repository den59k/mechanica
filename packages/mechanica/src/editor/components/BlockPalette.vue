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
import { editorStoreKey } from '../lib/store'
import { dragKey } from '../lib/drag-controller'

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

<style lang="scss" scoped>
.mech-palette {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mech-palette__search {
  margin-bottom: 2px;
}
.mech-palette__group-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--mech-muted);
  margin-bottom: 6px;
}
.mech-palette__item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--mech-radius-sm);
  background: none;
  color: var(--mech-fg);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: grab;
  margin-bottom: 2px;
  user-select: none;
  touch-action: none;
  transition:
    background 0.12s,
    border-color 0.12s;

  // Light by default so a long list reads as a calm menu; the drag ghost is the
  // "lifted" representation, so items themselves don't need a hover shadow.
  &:hover {
    background: var(--mech-hover);
    border-color: var(--mech-border);
  }
}
</style>
