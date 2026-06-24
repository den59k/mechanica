<template>
  <ul class="mech-tree">
    <li v-for="block in items" :key="block.id" class="mech-tree__node">
      <div
        class="mech-tree__row"
        :class="{ 'is-selected': store.selectedId === block.id }"
        :data-tree-id="block.id"
        @pointerdown="
          drag.begin({ kind: 'move', id: block.id, label: labelOf(block) }, $event, () =>
            store.select(block.id),
          )
        "
      >
        <span class="mech-tree__label">{{ labelOf(block) }}</span>
        <span class="mech-tree__actions">
          <button type="button" title="Move up" @pointerdown.stop @click.stop="store.move(block.id, -1)">
            <VIcon name="arrow-up" />
          </button>
          <button type="button" title="Move down" @pointerdown.stop @click.stop="store.move(block.id, 1)">
            <VIcon name="arrow-down" />
          </button>
          <button type="button" title="Delete" @pointerdown.stop @click.stop="store.remove(block.id)">
            <VIcon name="trash" />
          </button>
        </span>
      </div>
      <HierarchyTree v-if="childrenOf(block).length" :blocks="childrenOf(block)" />
    </li>
  </ul>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import type { ContentBlock } from '@mechanica/shared'
import { editorStoreKey } from '../lib/store'
import { dragKey } from '../lib/drag-controller'
import VIcon from './VIcon.vue'

const props = defineProps<{ blocks?: ContentBlock[] }>()
const store = inject(editorStoreKey)!
const drag = inject(dragKey)!
const items = props.blocks ?? store.content

const labelOf = (block: ContentBlock) => store.blocksById.get(block.blockId)?.name ?? block.blockId
const childrenOf = (block: ContentBlock): ContentBlock[] => {
  if (!block.children) return []
  return Array.isArray(block.children) ? block.children : Object.values(block.children).flat()
}
</script>

<style lang="scss" scoped>
.mech-tree {
  list-style: none;
  margin: 0;
  padding: 0;

  // Nested trees (child component roots inherit this scope) get indented.
  .mech-tree {
    padding-left: 12px;
    border-left: 1px solid var(--mech-border);
    margin-left: 7px;
  }
}
.mech-tree__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 8px;
  border-radius: var(--mech-radius-sm);
  cursor: pointer;
  user-select: none;
  touch-action: none;

  &:hover {
    background: var(--mech-hover);
  }
  &.is-selected {
    background: var(--mech-button);
    color: var(--mech-button-text);
  }
}
.mech-tree__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}
.mech-tree__actions {
  display: flex;
  gap: 1px;
  flex: none;
  opacity: 0;

  .mech-tree__row:hover &,
  .mech-tree__row.is-selected & {
    opacity: 1;
  }

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
    line-height: 1;
    width: 22px;
    height: 22px;
    border-radius: 4px;

    .vicon {
      width: 13px;
      height: 13px;
    }
    &:hover {
      opacity: 1;
      background: rgba(127, 127, 127, 0.2);
    }
  }
}
</style>
