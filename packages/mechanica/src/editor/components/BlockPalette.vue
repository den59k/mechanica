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
      <div class="mech-palette__grid">
        <button
          v-for="block in group.blocks"
          :key="block.id"
          type="button"
          class="mech-palette__item"
          :title="block.description"
          @pointerdown="onDown(block, $event)"
          @mouseenter="onEnter(block, $event)"
          @mouseleave="onLeave"
        >
          <span class="mech-palette__thumb">
            <VIcon v-if="block.icon" :name="block.icon" />
            <span v-else>{{ monogram(block) }}</span>
          </span>
          <span class="mech-palette__name">{{ block.name }}</span>
        </button>
      </div>
    </div>

    <p v-if="!groups.length" class="mech-tree__empty">No blocks match “{{ search }}”.</p>
    <p v-if="scopedOut > 0" class="mech-palette__scoped">
      {{ scopedOut }} {{ scopedOut === 1 ? 'block is' : 'blocks are' }} limited to other folders.
    </p>

    <BlockPreview
      v-if="hovered"
      :key="hovered.block.id"
      :block="hovered.block"
      :blocks="previewBlocks"
      :anchor="hovered.anchor"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from 'vue'
import { useSearch } from 'vuesix'
import type { Block } from '@mechanica/shared'
import type { BlocksMap } from '../../core/state'
import { editorStoreKey } from '../lib/store'
import { dragKey } from '../lib/drag-controller'
import { blockAvailableIn } from '../lib/block-meta'
import VIcon from './VIcon.vue'
import BlockPreview from './BlockPreview.vue'

const store = inject(editorStoreKey)!
const drag = inject(dragKey)!
const search = ref('')

// Folder-scoped blocks: only offer what this page's folder allows.
const available = computed(() => store.blocks.filter((block) => blockAvailableIn(block, store.folder)))
const scopedOut = computed(() => store.blocks.length - available.value.length)

const filtered = useSearch(
  search,
  () => available.value,
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

const monogram = (block: Block) => block.name.charAt(0).toUpperCase()

// A press begins a drag (or a tap to append) — drop any hover preview so it
// doesn't linger over the page while dragging.
function onDown(block: Block, event: PointerEvent) {
  clearHover()
  drag.begin({ kind: 'new', blockId: block.id, label: block.name }, event, () => store.addBlock(block.id))
}

// ── Hover preview ────────────────────────────────────────────────────────────
// Only the hovered card mounts a live preview (after a short intent delay), and
// it's torn down on leave — so there's never more than one live block at a time.
interface Hover {
  block: Block
  anchor: { top: number; left: number; height: number }
}
const hovered = ref<Hover | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

const previewBlocks = store.componentsById as unknown as BlocksMap

function onEnter(block: Block, event: MouseEvent) {
  if (!store.componentsById.has(block.id)) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const anchor = { top: rect.top, left: rect.left, height: rect.height }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    hovered.value = { block, anchor }
  }, 90)
}

function onLeave() {
  clearHover()
}
function clearHover() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  hovered.value = null
}

onBeforeUnmount(clearHover)
</script>

<style lang="scss" scoped>
.mech-palette {
  display: flex;
  flex-direction: column;
  gap: 14px;
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
  margin-bottom: 8px;
}

// Blocks read as tiles, two to a row, so the palette scans like a grid of things
// rather than a text menu. The live preview on hover is the real "what is this".
.mech-palette__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.mech-palette__item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--mech-border);
  border-radius: var(--mech-radius);
  background: var(--mech-bg);
  color: var(--mech-fg);
  font: inherit;
  text-align: left;
  cursor: grab;
  user-select: none;
  touch-action: none;
  transition:
    background 0.12s,
    border-color 0.12s;

  &:hover {
    background: var(--mech-hover);
    border-color: var(--mech-border-strong);
  }
}
.mech-palette__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  border-radius: var(--mech-radius-sm);
  background: var(--mech-active);
  color: var(--mech-muted);
  font-size: 16px;
  font-weight: 600;

  .vicon {
    width: 20px;
    height: 20px;
  }
}
.mech-palette__name {
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mech-palette__scoped {
  margin: 0;
  font-size: 11.5px;
  color: var(--mech-muted);
  text-align: center;
}
</style>
