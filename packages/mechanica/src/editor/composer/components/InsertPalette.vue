<template>
  <div class="mech-composer__insert">
    <div class="mech-composer__section-title">Insert</div>
    <div class="mech-composer__insert-grid">
      <button
        v-for="el in ELEMENTS"
        :key="el.blockId"
        type="button"
        class="mech-composer__insert-card"
        :title="el.container ? `${el.label} (container)` : el.label"
        @pointerdown="insert.arm(() => el.create(), el.label, $event)"
        @click="addElement(el.blockId)"
      >
        <VIcon :name="el.icon" />
        <span>{{ el.label }}</span>
      </button>
    </div>

    <template v-if="codeBlocks.length">
      <div class="mech-composer__section-title">Components</div>
      <div class="mech-composer__insert-grid">
        <button
          v-for="block in codeBlocks"
          :key="block.id"
          type="button"
          class="mech-composer__insert-card"
          :title="block.description ?? block.name"
          @pointerdown="insert.arm(() => makeCodeNode(block), block.name, $event)"
          @click="addCodeBlock(block)"
        >
          <VIcon :name="block.icon ?? 'slot'" />
          <span>{{ block.name }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { getDefaultValue, type Block, type ContentBlock } from 'mechanica-shared'
import { composerStoreKey, composerInsertDndKey } from '../lib/keys'
import { ELEMENTS } from '../lib/elements-meta'
import { uid } from '../../lib/content-tree'
import VIcon from '../../components/VIcon.vue'

const store = inject(composerStoreKey)!
const insert = inject(composerInsertDndKey)!
const codeBlocks = inject<Block[]>('composerCodeBlocks', [])

function makeCodeNode(block: Block): ContentBlock {
  const data = block.props ? (getDefaultValue(block.props) as Record<string, unknown>) : {}
  return { id: uid(), blockId: block.id, data: data ?? {} }
}

// A plain click (no drag) appends at the selection; a drag inserted at the drop
// spot already, so swallow the click that follows it.
function addElement(blockId: string) {
  if (insert.suppressClick) return
  store.addElement(blockId)
}
function addCodeBlock(block: Block) {
  if (insert.suppressClick) return
  store.insertNode(makeCodeNode(block))
}
</script>
