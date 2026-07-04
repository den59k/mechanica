<template>
  <div class="mech-palette">
    <input
      class="mech-input mech-palette__search"
      :value="search"
      placeholder="Search blocks…"
      @input="search = ($event.target as HTMLInputElement).value"
    />

    <button type="button" class="mech-button mech-palette__new" title="Build a new block in the composer" @click="newBlock">
      <VIcon name="plus" />
      <span>New block</span>
    </button>

    <div v-for="group in displayGroups" :key="group.name" class="mech-palette__group">
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
            <!-- A rendered thumbnail (mechanica thumbs --blocks) covers the
                 icon/monogram when it exists; a 404 just leaves the fallback. -->
            <img
              v-if="!thumbFailed.has(block.id)"
              class="mech-palette__thumb-img"
              :src="thumbSrc(block.id)"
              alt=""
              loading="lazy"
              @error="thumbFailed.add(block.id)"
            />
            <!-- Composed blocks (built in the composer) get Edit/Delete on hover. -->
            <span v-if="block.composed" class="mech-palette__card-actions">
              <span
                class="mech-palette__card-action"
                title="Edit in the composer"
                @pointerdown.stop.prevent
                @click.stop="editBlock(block)"
              ><VIcon name="pencil" /></span>
              <span
                class="mech-palette__card-action is-danger"
                title="Delete block"
                @pointerdown.stop.prevent
                @click.stop="deleteBlock(block)"
              ><VIcon name="trash" /></span>
            </span>
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
import type { Block } from 'mechanica-shared'
import type { BlocksMap } from '../../core/state'
import { editorStoreKey } from '../lib/store'
import { dragKey } from '../lib/drag-controller'
import { blockAvailableIn, compareBlocks } from '../lib/block-meta'
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
  // Within a category: explicit `order` first, then alphabetical (see compareBlocks).
  return [...byCategory.entries()].map(([name, blocks]) => ({ name, blocks: [...blocks].sort(compareBlocks) }))
})

// Recently inserted blocks lead the palette (kept in insertion order, not
// compareBlocks order) — hidden while searching, where relevance rules.
const recent = computed(() => {
  if (search.value) return []
  return store.recentBlockIds
    .map((id) => store.blocksById.get(id))
    .filter((block): block is Block => !!block && blockAvailableIn(block, store.folder))
    .slice(0, 6)
})

const displayGroups = computed(() =>
  recent.value.length ? [{ name: 'Recent', blocks: recent.value }, ...groups.value] : groups.value,
)

const monogram = (block: Block) => block.name.charAt(0).toUpperCase()

// Card thumbnails, pre-rendered by `mechanica thumbs --blocks`. Blocks without
// one 404 once and keep their icon/monogram fallback.
const thumbFailed = ref(new Set<string>())
const thumbSrc = (id: string) => `/@mechanica/thumbs/blocks/${encodeURIComponent(id)}.png`

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

// ── Composed-block entry points (Block Composer) ─────────────────────────────
// Navigating leaves the page editor; its beforeunload beacon flushes any
// pending save first, so edits are never lost.
function newBlock() {
  window.location.assign('/@mechanica/composer/~new')
}
function editBlock(block: Block) {
  clearHover()
  window.location.assign(`/@mechanica/composer/${encodeURIComponent(block.id)}`)
}
async function deleteBlock(block: Block) {
  clearHover()
  if (!window.confirm(`Delete block “${block.name}”? Pages using it will render nothing.`)) return
  await fetch(`/@mechanica/composed/delete?id=${encodeURIComponent(block.id)}`, { method: 'POST' })
  // Our own delete is skipped by the file watcher (no auto-reload) — refresh
  // so the palette and the live runtime drop the block.
  window.location.reload()
}
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
.mech-palette__new {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;

  .vicon {
    width: 15px;
    height: 15px;
  }
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
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 56px;
  border-radius: var(--mech-radius-sm);
  background: var(--mech-active);
  color: var(--mech-muted);
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  pointer-events: none;

  .vicon {
    width: 20px;
    height: 20px;
  }
}
// The rendered thumbnail sits over the icon/monogram; while it loads (or when
// it 404s and is removed) the fallback shows through.
.mech-palette__thumb-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
}
// Edit/Delete overlay on composed-block cards — revealed on card hover.
.mech-palette__card-actions {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 3px;
  opacity: 0;
  transition: opacity 0.12s;
  pointer-events: auto;
}
.mech-palette__item:hover .mech-palette__card-actions {
  opacity: 1;
}
.mech-palette__card-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--mech-bg);
  box-shadow: var(--mech-shadow-panel);
  color: var(--mech-fg-alt);
  cursor: pointer;

  &:hover {
    background: var(--mech-hover);
  }
  &.is-danger:hover {
    color: var(--mech-error);
  }
  .vicon {
    width: 13px;
    height: 13px;
  }
}
.mech-palette__name {
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.mech-palette__scoped {
  margin: 0;
  font-size: 11.5px;
  color: var(--mech-muted);
  text-align: center;
}
</style>
