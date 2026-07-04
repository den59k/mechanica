<template>
  <div ref="rootEl" class="mech-composer__toolbar">
    <button
      v-for="item in INSERT_ITEMS"
      :key="item.key"
      type="button"
      class="mech-composer__tool"
      :title="`${item.label} (${item.shortcut.toUpperCase()})`"
      @pointerdown="insert.arm(() => item.create(), item.label, $event)"
      @click="add(() => store.insertItem(item))"
    >
      <VIcon :name="item.icon" />
    </button>

    <div v-if="codeBlocks.length" class="mech-composer__tool-group">
      <button
        type="button"
        class="mech-composer__tool mech-composer__tool--wide"
        :class="{ 'is-open': open }"
        title="Insert a site component"
        @click="open = !open"
      >
        <VIcon name="component" />
        <span>Components</span>
        <VIcon name="chevron-down" class="mech-composer__tool-caret" />
      </button>
      <div v-if="open" class="mech-composer__popover">
        <input
          v-model="search"
          class="mech-composer__popover-search"
          type="text"
          placeholder="Search components…"
          aria-label="Search components"
        />
        <div class="mech-composer__popover-list">
          <button
            v-for="block in filtered"
            :key="block.id"
            type="button"
            class="mech-composer__popover-item"
            @pointerdown="insert.arm(() => makeCodeNode(block), block.name, $event)"
            @click="add(() => store.insertNode(makeCodeNode(block)))"
          >
            <VIcon :name="block.icon ?? 'slot'" />
            <span>{{ block.name }}</span>
          </button>
          <p v-if="!filtered.length" class="mech-composer__popover-empty">No matches</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { getDefaultValue, type Block, type ContentBlock } from 'mechanica-shared'
import { composerStoreKey, composerInsertDndKey } from '../lib/keys'
import { INSERT_ITEMS } from '../lib/elements-meta'
import { uid } from '../../lib/content-tree'
import VIcon from '../../components/VIcon.vue'

const store = inject(composerStoreKey)!
const insert = inject(composerInsertDndKey)!
const codeBlocks = inject<Block[]>('composerCodeBlocks', [])

const rootEl = ref<HTMLElement>()
const open = ref(false)
const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? codeBlocks.filter((b) => b.name.toLowerCase().includes(q) || b.id.includes(q)) : codeBlocks
})

function makeCodeNode(block: Block): ContentBlock {
  const data = block.props ? (getDefaultValue(block.props) as Record<string, unknown>) : {}
  return { id: uid(), blockId: block.id, data: data ?? {} }
}

// A plain click inserts at the selection; a drag already dropped at its spot.
function add(insertFn: () => void) {
  if (insert.suppressClick) return
  insertFn()
  open.value = false
}

// Close the components popover on an outside click.
const onDocPointerDown = (event: PointerEvent) => {
  if (rootEl.value && !rootEl.value.contains(event.target as Node)) open.value = false
}
watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('pointerdown', onDocPointerDown, true)
  else document.removeEventListener('pointerdown', onDocPointerDown, true)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDown, true))
</script>
