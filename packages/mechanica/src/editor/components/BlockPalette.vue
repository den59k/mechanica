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
        <!-- The empty page's "Start this page" group leads with a one-off page
             design: a palette-hidden composed block placed as the page's sole
             content, opened straight in the composer. -->
        <button
          v-if="group.action"
          type="button"
          class="mech-palette__item mech-palette__item--action"
          title="Create a block just for this page and design it in the composer"
          @click="designPage"
        >
          <span class="mech-palette__thumb mech-palette__thumb--action"><VIcon name="frame" /></span>
          <span class="mech-palette__name">Design this page</span>
        </button>
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
      {{ scopedOut }} {{ scopedOut === 1 ? 'block is' : 'blocks are' }} limited to other folders or layouts.
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
import { blockAvailableIn, blockAvailableForLayout, compareBlocks } from '../lib/block-meta'
import { runtimeLayoutNames } from '../lib/bridge'
import { navigationKey, fallbackNavigation } from '../lib/navigation'
import { createRootFrame } from '../composer/lib/normalize-template'
import { uid } from '../lib/content-tree'
import VIcon from './VIcon.vue'
import BlockPreview from './BlockPreview.vue'

const store = inject(editorStoreKey)!
const drag = inject(dragKey)!
const navigation = inject(navigationKey, null) ?? fallbackNavigation()
const search = ref('')

const pageEmpty = computed(() => store.content.length === 0)

// The effective layout this page renders with — its own, or the app's default.
const layoutNames = runtimeLayoutNames()
const currentLayout = computed(() => store.layout ?? layoutNames[0] ?? null)

// Scope filters (folder + layout) apply to everything the palette offers.
const inScope = (block: Block) =>
  blockAvailableIn(block, store.folder) && blockAvailableForLayout(block, currentLayout.value)

// What the palette could ever offer here: no hidden blocks, and standalone
// (whole-page) blocks only while the page is still empty.
const offerable = computed(() =>
  store.blocks.filter((block) => !block.hidden && (!block.standalone || pageEmpty.value)),
)
const available = computed(() => offerable.value.filter(inScope))
const scopedOut = computed(() => offerable.value.length - available.value.length)

const filtered = useSearch(
  search,
  () => available.value,
  (block: Block) => `${block.name} ${block.category ?? ''}`,
)

interface PaletteGroup {
  name: string
  blocks: Block[]
  /** The empty-page starter group: leads with the "Design this page" card. */
  action?: boolean
}

const START_GROUP = 'Start this page'

const groups = computed<PaletteGroup[]>(() => {
  const byCategory = new Map<string, Block[]>()
  // Standalone (whole-page) blocks group under the empty page's starter section
  // (`offerable` already dropped them on non-empty pages).
  for (const block of filtered.value) {
    const category = block.standalone ? START_GROUP : (block.category ?? '')
    if (!byCategory.has(category)) byCategory.set(category, [])
    byCategory.get(category)!.push(block)
  }
  // Within a category: explicit `order` first, then alphabetical (see compareBlocks).
  const list: PaletteGroup[] = [...byCategory.entries()].map(([name, blocks]) => ({
    name,
    blocks: [...blocks].sort(compareBlocks),
  }))
  const at = list.findIndex((group) => group.name === START_GROUP)
  const start = at === -1 ? undefined : list.splice(at, 1)[0]
  // An empty page always opens with the starter group — the "Design this page"
  // card plus the site's standalone page blocks. While searching, only matching
  // page blocks remain (relevance rules; the action card steps back).
  if (pageEmpty.value && !search.value) {
    list.unshift({ name: START_GROUP, blocks: start?.blocks ?? [], action: true })
  } else if (start) {
    list.unshift(start)
  }
  return list
})

// Recently inserted blocks lead the regular groups (kept in insertion order,
// not compareBlocks order) — hidden while searching, where relevance rules.
const recent = computed(() => {
  if (search.value) return []
  return store.recentBlockIds
    .map((id) => store.blocksById.get(id))
    .filter((block): block is Block => !!block && !block.hidden && !block.standalone && inScope(block))
    .slice(0, 6)
})

const displayGroups = computed<PaletteGroup[]>(() => {
  if (!recent.value.length) return groups.value
  const list = [...groups.value]
  // Recent slots in after the starter section, never above it.
  const after = list[0]?.action ? 1 : 0
  list.splice(after, 0, { name: 'Recent', blocks: recent.value })
  return list
})

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
// "Design this page": a one-off composed block bound to this page. It's created
// `hidden: true` (never offered under "Site blocks" elsewhere — untick in the
// composer settings to promote it), placed as the page's sole content, and
// opened in the composer; the placement save flushes via the unload beacon.
async function designPage() {
  const path = navigation.path.value.replace(/\/+$/, '') || '/'
  const slug =
    (path === '/' ? 'home' : path.slice(1).replace(/\//g, '-'))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'home'
  const base = `${slug}-page`
  let id = base
  for (let n = 2; store.blocksById.has(id); n++) id = `${base}-${n}`
  const name = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ') + ' page'
  const def = { id, name, hidden: true, template: [createRootFrame()] }
  const res = await fetch('/@mechanica/composed/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(def),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { id?: string } | string } | null
    const message = typeof err?.error === 'object' ? err?.error?.id : err?.error
    window.alert(`Could not create the block: ${message ?? res.status}`)
    return
  }
  store.content.push({ id: uid(), blockId: id, data: {} })
  window.location.assign(`/@mechanica/composer/${encodeURIComponent(id)}`)
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
// The "Design this page" starter card: same tile shape, dashed and calm until
// hovered — an invitation, not another block.
.mech-palette__item--action {
  border-style: dashed;
  cursor: pointer;

  &:hover {
    border-color: var(--mech-accent);

    .mech-palette__thumb--action {
      color: var(--mech-accent);
    }
  }
}
.mech-palette__thumb--action {
  background: var(--mech-bg);
  border: 1px dashed var(--mech-border-strong);
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
