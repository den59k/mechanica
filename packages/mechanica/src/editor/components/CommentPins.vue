<template>
  <div class="mech-comment-layer" data-mech-ui>
    <button
      v-for="pin in pins"
      :key="pin.thread.id"
      type="button"
      class="mech-comment-pin"
      :class="{
        'is-active': pin.thread.id === comments.activeId,
        'is-resolved': pin.thread.status === 'resolved',
      }"
      :style="pinStyle(pin.point)"
      :title="pinTitle(pin.thread)"
      :data-thread-id="pin.thread.id"
      @mouseenter="store.setHover(pin.blockId)"
      @click="comments.openThread(pin.thread.id === comments.activeId ? null : pin.thread.id)"
    >
      {{ initials(pin.thread.messages[0]?.author.name)[0] }}
    </button>

    <span v-if="draftPoint" class="mech-comment-pin is-draft" :style="pinStyle(draftPoint)" aria-hidden="true">
      <VIcon name="plus" />
    </span>

    <!-- One card at a time: the draft's form, or the open thread. Keyed so a
         thread's reply text never leaks into another's; the draft keeps its
         text while its pin is moved by another click. -->
    <CommentThreadCard
      v-if="comments.draft"
      key="draft"
      :thread="null"
      :point="draftPoint"
      :place="draftPlace"
      :inset="inset"
    />
    <CommentThreadCard
      v-else-if="comments.active"
      :key="comments.active.id"
      :thread="comments.active"
      :point="activePoint"
      :place="activePlace"
      :inset="inset"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted } from 'vue'
import { resolveAnchor, type CommentThread } from 'mechanica-shared'
import { editorStoreKey } from '../lib/store'
import {
  commentsKey,
  initials,
  pinPoint,
  placeThreads,
  threadPlace,
  PIN_SIZE,
  type Point,
} from '../lib/comments'
import { blockRect, useBlockRects } from '../lib/use-block-frames'
import CommentThreadCard from './CommentThreadCard.vue'
import VIcon from './VIcon.vue'

/**
 * The comment mode's layer over the live page: a pin per visible thread, the
 * draft's pin, and the card of whichever is open. Mounted only while
 * commenting — with the editor's panels shown or hidden.
 */
defineProps<{
  /** How much room the side panels take on each side (px); absent = their usual width. */
  inset?: number
}>()

const store = inject(editorStoreKey)!
const comments = inject(commentsKey)!

const placed = computed(() => placeThreads(store.content, comments.visibleThreads))
const blockName = (blockType: string) => store.blocksById.get(blockType)?.name

// The draft's block as it is now (its anchor was made a moment ago, but the
// page may still change under it).
const draftBlockId = computed(() => {
  const anchor = comments.draft?.anchor
  return anchor ? (resolveAnchor(store.content, anchor)?.block.id ?? null) : null
})

// One rAF loop keeps every pinned block's rect current.
const rects = useBlockRects(() => {
  const ids = placed.value.pinned.map((pin) => pin.blockId)
  if (draftBlockId.value) ids.push(draftBlockId.value)
  return ids
})

// A block that only just got its first pin is tracked from the next frame on:
// read its rect directly until then, so neither the pin nor its card (which
// would flash docked) arrives a frame late.
const rectOf = (blockId: string) => rects.value.get(blockId) ?? blockRect(blockId)

const pins = computed(() => {
  // Threads without a click point all sit in their block's corner: fan them
  // out leftwards so each stays clickable.
  const cornered = new Map<string, number>()
  const list: { thread: CommentThread; blockId: string; point: Point }[] = []
  for (const { thread, blockId } of placed.value.pinned) {
    const rect = rectOf(blockId)
    if (!rect) continue
    const point = pinPoint(rect, thread.anchor)
    if (thread.anchor?.x == null) {
      const nth = cornered.get(blockId) ?? 0
      cornered.set(blockId, nth + 1)
      point.left = Math.max(rect.left, point.left - nth * (PIN_SIZE + 4))
    }
    list.push({ thread, blockId, point })
  }
  return list
})

const draftPoint = computed<Point | null>(() => {
  const anchor = comments.draft?.anchor
  const rect = draftBlockId.value ? rectOf(draftBlockId.value) : null
  return anchor && rect ? pinPoint(rect, anchor) : null
})
const draftPlace = computed(() => threadPlace({ anchor: comments.draft?.anchor ?? undefined }, false, blockName))

const activePoint = computed<Point | null>(
  () => pins.value.find((pin) => pin.thread.id === comments.activeId)?.point ?? null,
)
const activePlace = computed(() => {
  const thread = comments.active
  return thread ? threadPlace(thread, placed.value.removedIds.includes(thread.id), blockName) : ''
})

const pinStyle = (point: Point) => ({ '--pin-x': `${point.left}px`, '--pin-y': `${point.top}px` })

function pinTitle(thread: CommentThread): string {
  const first = thread.messages[0]
  if (!first) return 'Comment'
  const line = first.body.trim().split('\n')[0] ?? ''
  return `${first.author.name}: ${line.length > 80 ? `${line.slice(0, 79)}…` : line}`
}

// The page shows a commenting cursor while this layer is up (see editor.scss).
onMounted(() => document.documentElement.classList.add('mech-commenting'))
onBeforeUnmount(() => document.documentElement.classList.remove('mech-commenting'))
</script>

<style lang="scss" scoped>
// A Figma-style pin: a round marker whose sharp bottom-left corner sits on the
// commented point. Position comes in through --pin-x / --pin-y.
.mech-comment-pin {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147482600; // over the block frames, under the side panels
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  box-sizing: border-box;
  border: none;
  border-radius: 12px 12px 12px 3px;
  background: var(--mech-accent);
  color: #fff;
  font-family: var(--mech-font);
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  box-shadow:
    0 0 0 2px #fff,
    0 2px 8px rgba(20, 23, 28, 0.22);
  transform: translate(var(--pin-x), calc(var(--pin-y) - 100%)) scale(var(--pin-scale, 1));
  transform-origin: 0 100%;
  transition: box-shadow 0.12s ease;

  &:hover {
    --pin-scale: 1.1;
  }
  // The open thread's pin: a touch larger, with a soft accent ring.
  &.is-active {
    --pin-scale: 1.2;
    z-index: 2147482650;
    box-shadow:
      0 0 0 2px #fff,
      0 0 0 5px var(--mech-ring),
      0 2px 8px rgba(20, 23, 28, 0.22);
  }
  // Resolved: outlined and muted, clearly out of the way.
  &.is-resolved {
    background: var(--mech-bg);
    color: var(--mech-muted);
    box-shadow:
      inset 0 0 0 1.5px var(--mech-border-strong),
      0 1px 4px rgba(20, 23, 28, 0.12);
  }
  &.is-resolved.is-active {
    box-shadow:
      inset 0 0 0 1.5px var(--mech-accent),
      0 0 0 4px var(--mech-ring);
  }
  // The comment being written.
  &.is-draft {
    --pin-scale: 1.2;
    z-index: 2147482650;
    cursor: default;
    pointer-events: none;

    .vicon {
      width: 13px;
      height: 13px;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .mech-comment-pin {
    transition: none;
  }
}
</style>
