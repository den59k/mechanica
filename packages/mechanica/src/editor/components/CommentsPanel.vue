<template>
  <div class="mech-comments">
    <div class="mech-editor__heading">
      <span class="mech-comments__title">
        Comments
        <span v-if="comments.openCount" class="mech-comments__count" title="Open comments on this page">{{
          comments.openCount
        }}</span>
      </span>
      <button type="button" class="mech-icon-button" title="Back to blocks (Esc)" @click="comments.toggleMode()">
        <VIcon name="close" />
      </button>
    </div>

    <p v-if="comments.error" class="mech-comments__error" role="alert">{{ comments.error }}</p>

    <div class="mech-comments__controls">
      <label class="mech-checkbox">
        <input v-model="comments.showResolved" type="checkbox" />
        <span>Show resolved<template v-if="resolvedCount"> ({{ resolvedCount }})</template></span>
      </label>
      <button
        type="button"
        class="mech-editor__data mech-comments__copy"
        title="Copy a prompt that tells a coding agent how to read and resolve this page's comments"
        @click="copyPrompt"
      >
        <VIcon :name="copied ? 'check' : 'copy'" />
        <span>{{ copied ? 'Copied' : 'Copy for Claude' }}</span>
      </button>
    </div>

    <p v-if="!rows.length" class="mech-comments__empty">Click anywhere on the page to leave a comment.</p>
    <ul v-else class="mech-comments__list">
      <li v-for="row in rows" :key="row.thread.id">
        <button
          type="button"
          class="mech-comments__row"
          :class="{
            'is-active': row.thread.id === comments.activeId,
            'is-resolved': row.thread.status === 'resolved',
          }"
          :data-thread-id="row.thread.id"
          @mouseenter="store.setHover(row.blockId)"
          @mouseleave="store.setHover(null)"
          @click="open(row)"
        >
          <span class="mech-comment-avatar" :class="{ 'is-agent': row.author?.kind === 'agent' }">{{
            initials(row.author?.name)
          }}</span>
          <span class="mech-comments__main">
            <span class="mech-comments__text">{{ row.text }}</span>
            <span class="mech-comments__meta">
              <span class="mech-comments__place">{{ row.place }}</span>
              <span v-if="row.replies" class="mech-comments__fact">{{ row.replies }} {{ row.replies === 1 ? 'reply' : 'replies' }}</span>
              <span class="mech-comments__fact">{{ row.time }}</span>
            </span>
          </span>
        </button>
      </li>
    </ul>

    <button type="button" class="mech-button is-block mech-comments__page" @click="comments.startDraft(null)">
      Comment on the whole page
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from 'vue'
import type { CommentAuthor, CommentThread } from 'mechanica-shared'
import { editorStoreKey } from '../lib/store'
import { agentPrompt, commentsKey, initials, placeThreads, relativeTime, threadPlace } from '../lib/comments'
import { blockElement } from '../lib/use-block-frames'
import VIcon from './VIcon.vue'

/** The right panel in comment mode: this page's threads, and the way to hand them to an agent. */
const store = inject(editorStoreKey)!
const comments = inject(commentsKey)!

interface Row {
  thread: CommentThread
  /** The thread's block as it is now; null for a page-level thread or a removed block. */
  blockId: string | null
  author: CommentAuthor | undefined
  text: string
  place: string
  replies: number
  time: string
}

const rows = computed<Row[]>(() => {
  const threads = comments.visibleThreads
  const placed = placeThreads(store.content, threads)
  const blockOf = new Map(placed.pinned.map((pin) => [pin.thread.id, pin.blockId]))
  const name = (blockType: string) => store.blocksById.get(blockType)?.name
  return threads.map((thread) => {
    const first = thread.messages[0]
    return {
      thread,
      blockId: blockOf.get(thread.id) ?? null,
      author: first?.author,
      text: first?.body.trim() ?? '',
      place: threadPlace(thread, placed.removedIds.includes(thread.id), name),
      replies: Math.max(0, thread.messages.length - 1),
      time: relativeTime(thread.createdAt),
    }
  })
})

const resolvedCount = computed(() => comments.threads.length - comments.openCount)

function open(row: Row): void {
  if (row.blockId) blockElement(row.blockId)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  comments.openThread(row.thread.id)
}

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
async function copyPrompt(): Promise<void> {
  try {
    await navigator.clipboard.writeText(agentPrompt(comments.page ?? '/'))
  } catch {
    comments.error = 'Could not copy to the clipboard'
    return
  }
  copied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (copied.value = false), 1600)
}
onBeforeUnmount(() => {
  clearTimeout(copiedTimer)
  // Don't leave a row's hover frame behind.
  store.setHover(null)
})
</script>

<style lang="scss" scoped>
.mech-comments {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
// The heading row carries a close button: keep the row's usual height.
.mech-editor__heading {
  margin: -6px -4px -6px 0;
}
.mech-comments__title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.mech-comments__count {
  min-width: 18px;
  padding: 1px 6px;
  box-sizing: border-box;
  border-radius: var(--mech-radius-pill);
  background: var(--mech-accent-soft);
  color: var(--mech-accent);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  text-align: center;
}
.mech-comments__error {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--mech-radius-sm);
  background: rgba(221, 40, 40, 0.06);
  color: var(--mech-error);
  font-size: 12.5px;
  line-height: 1.4;
}
.mech-comments__controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;

  .mech-checkbox {
    font-size: 12.5px;
  }
}
.mech-comments__copy {
  flex: none;
}
.mech-comments__empty {
  margin: 4px 0 0;
  color: var(--mech-muted);
  font-size: 12.5px;
  line-height: 1.45;
}
.mech-comments__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 -6px;
  padding: 0;
  list-style: none;
}
.mech-comments__row {
  display: flex;
  gap: 9px;
  width: 100%;
  padding: 8px 6px;
  border: none;
  border-radius: var(--mech-radius-sm);
  background: none;
  color: var(--mech-fg);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s;

  &:hover {
    background: var(--mech-hover);
  }
  // The open thread: selection blue, like a selected tree row.
  &.is-active {
    background: var(--mech-accent-soft);
  }
  &.is-resolved {
    .mech-comments__text {
      color: var(--mech-muted);
    }
    .mech-comment-avatar {
      opacity: 0.55;
    }
  }
}
.mech-comments__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.mech-comments__text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.mech-comments__meta {
  display: flex;
  flex-wrap: wrap;
  column-gap: 5px;
  color: var(--mech-muted);
  font-size: 11.5px;
  line-height: 1.4;
}
.mech-comments__place {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mech-comments__fact {
  white-space: nowrap;

  &::before {
    content: '·';
    margin-right: 5px;
  }
}
.mech-comments__page {
  flex: none;
}
</style>
