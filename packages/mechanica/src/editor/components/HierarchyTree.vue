<template>
  <ul class="mech-tree" :class="{ 'is-root': depth === 0 }" :style="{ '--slot-pad': slotPad + 'px' }">
    <li
      v-for="block in items"
      :key="block.id"
      class="mech-tree__node"
      :class="{ 'is-expanded': expandable(block) && !isCollapsed(block.id) }"
      :style="{ '--depth': depth }"
    >
      <div
        class="mech-tree__row"
        :class="{
          'is-selected': store.selectedId === block.id,
          'is-hover': store.hoverId === block.id && !drag.payload,
          'is-drop-before': isDrop(block.id, 'before'),
          'is-drop-after': isDrop(block.id, 'after'),
          'is-drop-inside': isContainer(block.id, 'default'),
          'is-drop-outline': isContainer(block.id, 'default') && directInside,
          'is-drop-within': isContainerNamed(block.id),
        }"
        :style="{ '--depth': depth }"
        :data-tree-id="block.id"
        @mouseenter="store.setHover(block.id)"
        @mouseleave="store.setHover(null)"
        @pointerdown="
          drag.begin({ kind: 'move', id: block.id, label: labelOf(block) }, $event, () =>
            store.select(block.id),
          )
        "
      >
        <button
          v-if="expandable(block)"
          type="button"
          class="mech-tree__toggle"
          :class="{ 'is-collapsed': isCollapsed(block.id) }"
          :title="isCollapsed(block.id) ? 'Expand' : 'Collapse'"
          @pointerdown.stop
          @click.stop="toggleCollapsed(block.id)"
        >
          <VIcon name="chevron-down" />
        </button>
        <VIcon v-if="iconOf(block)" :name="iconOf(block)!" class="mech-tree__icon" />
        <span class="mech-tree__label">{{ labelOf(block) }}</span>
        <!-- Mark containers so they read as droppable even when empty: a named-slot
             block (its slot nodes show below) and a regular default-slot block get
             distinct badges; a leaf block gets none. -->
        <span
          v-if="hasNamedSlot(block)"
          class="mech-tree__slot-badge"
          title="Has named slots — drop a block into a slot below"
        >
          <VIcon name="named-slots" />
        </span>
        <span
          v-else-if="hasDefaultSlot(block)"
          class="mech-tree__slot-badge"
          title="Has a content slot — drop blocks inside"
        >
          <VIcon name="slot" />
        </span>
      </div>

      <template v-if="expandable(block) && !isCollapsed(block.id)">
        <!-- Default-slot (or untyped) children render directly under the block. -->
        <HierarchyTree
          v-if="layout(block).kind === 'flat'"
          :blocks="(layout(block) as FlatLayout).children"
          :depth="depth + 1"
          :slot-pad="slotPad"
        />

        <!-- Named slots render as drop-target nodes, each holding its own children. -->
        <template v-else>
          <div v-for="slot in (layout(block) as SlotLayout).slots" :key="slot.name" class="mech-tree__slot-group">
            <div
              class="mech-tree__slot"
              :class="{
                'is-drop-target': isContainer(block.id, slot.name),
                'is-drop-outline': isContainer(block.id, slot.name) && directInside,
              }"
              :style="{ '--depth': depth }"
              :data-tree-slot="`${block.id}:${slot.name}`"
              :title="`Slot: ${slot.name} — drag a block here`"
            >
              <span class="mech-tree__slot-tick" />
              <span class="mech-tree__slot-name">{{ slot.name }}</span>
            </div>
            <!-- Slot blocks sit one level below the block, plus a slight step
                 right of the slot label (slotPad) so it's clear which block
                 belongs to which slot. -->
            <HierarchyTree
              v-if="slot.children.length"
              :blocks="slot.children"
              :depth="depth + 1"
              :slot-pad="slotPad + SLOT_INDENT"
            />
            <div
              v-else
              class="mech-tree__slot-empty"
              :style="{ '--depth': depth + 1, '--slot-pad': slotPad + SLOT_INDENT + 'px' }"
            >
              empty
            </div>
          </div>
        </template>
      </template>
    </li>

    <!-- Append-to-root line: shown when a drag would land at the end of the page. -->
    <li v-if="depth === 0 && rootDrop" class="mech-tree__root-drop" aria-hidden="true" />
  </ul>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { ContentBlock } from '@mechanica/shared'
import { editorStoreKey } from '../lib/store'
import { dragKey } from '../lib/drag-controller'
import { isCollapsed, toggleCollapsed } from '../lib/tree-ui'
import VIcon from './VIcon.vue'

interface FlatLayout {
  kind: 'flat'
  children: ContentBlock[]
}
interface SlotLayout {
  kind: 'slots'
  slots: { name: string; children: ContentBlock[] }[]
}

const props = withDefaults(
  // `slotPad` is the accumulated extra indent (px) from enclosing named slots —
  // threaded down explicitly so it composes without a cyclic CSS custom property.
  defineProps<{ blocks?: ContentBlock[]; depth?: number; slotPad?: number }>(),
  { depth: 0, slotPad: 0 },
)
const SLOT_INDENT = 6
const store = inject(editorStoreKey)!
const drag = inject(dragKey)!

const items = computed(() => props.blocks ?? store.content)

const labelOf = (block: ContentBlock) => store.blocksById.get(block.blockId)?.name ?? block.blockId
// Only show an icon the block author actually chose — no generic filler glyph.
const iconOf = (block: ContentBlock) => store.blocksById.get(block.blockId)?.icon

const slotNamesOf = (block: ContentBlock): string[] => {
  const slots = store.blocksById.get(block.blockId)?.slots
  return slots ? Object.keys(slots) : []
}
// Declares an unnamed default slot (renders children flush, with no slot node).
const hasDefaultSlot = (block: ContentBlock): boolean =>
  !!store.blocksById.get(block.blockId)?.slots?.default
// Declares at least one named slot (each shows as its own node below the block).
const hasNamedSlot = (block: ContentBlock): boolean =>
  slotNamesOf(block).some((name) => name !== 'default')
const childrenInSlot = (block: ContentBlock, slot: string): ContentBlock[] => {
  if (!block.children) return []
  if (Array.isArray(block.children)) return slot === 'default' ? block.children : []
  return block.children[slot] ?? []
}
const flatChildren = (block: ContentBlock): ContentBlock[] => {
  if (!block.children) return []
  return Array.isArray(block.children) ? block.children : Object.values(block.children).flat()
}

/** A block's tree shape: flat children (default/untyped) or named-slot nodes. */
const layout = (block: ContentBlock): FlatLayout | SlotLayout => {
  const names = slotNamesOf(block)
  const hasNamed = names.some((name) => name !== 'default')
  if (!hasNamed) return { kind: 'flat', children: flatChildren(block) }
  return { kind: 'slots', slots: names.map((name) => ({ name, children: childrenInSlot(block, name) })) }
}
// Expandable when it has children, or declares named slots (so empty slots can be revealed + filled).
const expandable = (block: ContentBlock): boolean => {
  const l = layout(block)
  return l.kind === 'slots' ? l.slots.length > 0 : l.children.length > 0
}

// ── Drop painting (driven by the shared logical drop + its container) ───────
// Rows/slots derive their highlight from `drag.drop` (the precise before/after
// line) and `drag.container` (the parent block + slot the drop falls into), so a
// drag computed over the live page lights up the matching nodes here, and an
// insertion *inside* a slot also reveals its parent block and the slot itself.
const isDrop = (id: string, position: 'before' | 'after'): boolean => {
  const d = drag.drop
  return !!d && d.anchorId === id && d.position === position
}
/** This block is the drop's container, via the given slot (`'default'` for unnamed). */
const isContainer = (id: string, slot: string): boolean =>
  drag.container?.parentId === id && drag.container.slot === slot
/** This block is the container via one of its *named* slots (tints the owner row). */
const isContainerNamed = (id: string): boolean =>
  drag.container != null && drag.container.parentId === id && drag.container.slot !== 'default'
// Outline the container only when the pointer is over it directly; a child-position
// drop just fills it.
const directInside = computed(() => drag.drop?.position === 'inside')
const rootDrop = computed(() => drag.drop?.anchorId === null)
</script>

<style lang="scss" scoped>
// Indentation per nesting level; also positions the vertical guide lines.
$step: 16px;

.mech-tree {
  list-style: none;
  margin: 0;
  padding: 0;
}
// Each expanded block draws one continuous vertical guide down its children, set
// at the block's own indent — so nested groups read as connected spines and you
// can trace which blocks belong to which parent.
.mech-tree__node {
  position: relative;

  &.is-expanded::before {
    content: '';
    position: absolute;
    top: 30px;
    bottom: 4px;
    left: calc(var(--depth, 0) * #{$step} + 8px + var(--slot-pad, 0px));
    width: 1px;
    background: var(--mech-border);
    pointer-events: none;
  }
  // Tint the spine of the selected container so its contents stand out.
  &.is-expanded:has(> .mech-tree__row.is-selected)::before {
    background: color-mix(in srgb, var(--mech-accent) 45%, transparent);
  }
}
// Full-width rows; leaves sit flush (no reserved chevron column) and only depth
// adds indentation, so a flat page reads as a clean flush list.
.mech-tree__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding-right: 8px;
  padding-left: calc(var(--depth, 0) * #{$step} + 4px + var(--slot-pad, 0px));
  border-radius: var(--mech-radius-sm);
  cursor: pointer;
  user-select: none;
  touch-action: none;
  color: var(--mech-fg-alt);
  transition: background 0.1s;

  // Hover is store-driven (`is-hover`, mirrored with the page) and suppressed
  // mid-drag; no bare `:hover`, which would otherwise re-appear while dragging.
  &.is-hover {
    background: var(--mech-hover);
  }
  // One selection language across the editor: the accent blue (matching the
  // in-page selection frame); solid black stays reserved for primary actions.
  &.is-selected {
    background: var(--mech-accent-soft);
    color: var(--mech-accent);
  }

  // ── Drop feedback ─────────────────────────────────────────────────────────
  // An insertion line at the row's top (before) or bottom (after), inset to the
  // row's content so it reads like a Figma drop indicator.
  &.is-drop-before::after,
  &.is-drop-after::after {
    content: '';
    position: absolute;
    left: calc(var(--depth, 0) * #{$step} + 4px + var(--slot-pad, 0px));
    right: 6px;
    height: 2px;
    background: var(--mech-accent);
    border-radius: 1px;
    pointer-events: none;
  }
  &.is-drop-before::after {
    top: -1px;
  }
  &.is-drop-after::after {
    bottom: -1px;
  }
  // The drop lands in this block's default slot → fill it for context…
  &.is-drop-inside {
    background: var(--mech-accent-soft);
    color: var(--mech-accent);
  }
  // …and ring it only when the pointer is over the block itself.
  &.is-drop-outline {
    box-shadow: inset 0 0 0 1.5px var(--mech-accent);
  }
  // A named slot of this block is the target → tint the owner for context.
  &.is-drop-within {
    background: var(--mech-accent-soft);
  }
}
.mech-tree__toggle {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: -4px;
  padding: 0;
  border: none;
  background: none;
  border-radius: 4px;
  color: var(--mech-muted);
  cursor: pointer;

  .vicon {
    width: 13px;
    height: 13px;
    transition: transform 0.14s ease;
  }
  &.is-collapsed .vicon {
    transform: rotate(-90deg);
  }
  &:hover {
    color: var(--mech-fg);
  }
}
.mech-tree__icon {
  flex: none;
  width: 15px;
  height: 15px;
  color: var(--mech-muted);
}
.mech-tree__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 500;
}
// A faint trailing marker that the block has a regular content slot.
.mech-tree__slot-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  color: var(--mech-placeholder);

  .vicon {
    width: 13px;
    height: 13px;
  }
}
.mech-tree__row:hover .mech-tree__slot-badge {
  color: var(--mech-muted);
}
.mech-tree__row.is-selected {
  .mech-tree__icon,
  .mech-tree__toggle,
  .mech-tree__slot-badge {
    color: var(--mech-accent);
  }
}

// Append-to-root indicator: a line after the last top-level block.
.mech-tree__root-drop {
  height: 2px;
  margin: 3px 6px 0 4px;
  background: var(--mech-accent);
  border-radius: 1px;
  list-style: none;
}

// ── Slot nodes ───────────────────────────────────────────────────────────────
// Holds a slot's blocks; the slight extra indent (added inside each row's own
// padding, so backgrounds still span full width) sets them a step right of the
// slot label, making slot membership clear. It composes through nesting.
// The slot label is a lightweight header just inside its block: indented enough
// that its tick clears the block's chevron column, with the slot's blocks stepped
// a little further right again (via --slot-pad) so the three levels stair neatly.
.mech-tree__slot {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding-left: calc(var(--depth, 0) * #{$step} + 16px + var(--slot-pad, 0px));
  padding-right: 8px;
  border-radius: var(--mech-radius-sm);
  color: var(--mech-muted);

  &:hover {
    background: var(--mech-hover);
  }
  // The active drop target → pull it into the accent language with a fill…
  &.is-drop-target {
    background: var(--mech-accent-soft);
    color: var(--mech-accent);

    .mech-tree__slot-tick {
      border-color: var(--mech-accent);
    }
  }
  // …and ring it only when the pointer is over the slot node itself.
  &.is-drop-outline {
    box-shadow: inset 0 0 0 1.5px var(--mech-accent);
  }
}
.mech-tree__slot-tick {
  flex: none;
  width: 5px;
  height: 5px;
  border-radius: 1px;
  border: 1.5px solid var(--mech-border-strong);
}
.mech-tree__slot-name {
  font-size: 9.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
// An empty slot reads as a droppable placeholder: a small dashed chip echoing
// the dashed slot badge, rather than a bare word.
.mech-tree__slot-empty {
  display: inline-flex;
  align-items: center;
  margin: 1px 0 3px calc(var(--depth, 0) * #{$step} + 4px + var(--slot-pad, 0px));
  padding: 2px 9px;
  border: 1px dashed var(--mech-border-strong);
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--mech-placeholder);
}
</style>
