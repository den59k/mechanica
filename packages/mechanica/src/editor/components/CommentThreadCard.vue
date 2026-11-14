<template>
  <div
    ref="cardRef"
    class="mech-comment-card"
    :class="{ 'is-docked': !point }"
    :style="style"
    role="dialog"
    :aria-label="thread ? 'Comment thread' : 'New comment'"
  >
    <header class="mech-comment-card__head">
      <span class="mech-comment-card__place">{{ place }}</span>
      <span
        v-if="hint"
        class="mech-comment-card__hint"
        title="The viewport width this comment was made at"
      >{{ hint }}</span>
      <span v-if="thread && thread.status === 'resolved'" class="mech-comment-card__hint">Resolved</span>
      <button type="button" class="mech-icon-button" title="Close (Esc)" @click="close">
        <VIcon name="close" />
      </button>
    </header>

    <div ref="scrollRef" class="mech-comment-card__scroll">
      <blockquote v-if="quoteText" class="mech-comment-card__quote">{{ quoteText }}</blockquote>

      <ol v-if="thread" class="mech-comment-card__messages">
        <li v-for="message in thread.messages" :key="message.id" class="mech-comment-card__message">
          <span class="mech-comment-avatar" :class="{ 'is-agent': message.author.kind === 'agent' }">{{
            initials(message.author.name)
          }}</span>
          <div class="mech-comment-card__content">
            <div class="mech-comment-card__meta">
              <span class="mech-comment-card__author">{{ message.author.name }}</span>
              <span v-if="message.author.kind === 'agent'" class="mech-comment-card__tag" title="Written by a coding agent">AI</span>
              <time class="mech-comment-card__time" :datetime="message.createdAt" :title="fullDate(message.createdAt)">{{
                relativeTime(message.createdAt)
              }}</time>
            </div>
            <p class="mech-comment-card__body">{{ message.body }}</p>
          </div>
        </li>
      </ol>

      <p v-if="thread && thread.status === 'resolved' && thread.resolvedBy" class="mech-comment-card__resolved">
        Resolved by {{ thread.resolvedBy.name }}<template v-if="thread.resolvedAt"> · {{ relativeTime(thread.resolvedAt) }}</template>
      </p>
    </div>

    <textarea
      ref="inputRef"
      v-model="text"
      class="mech-input mech-comment-card__input"
      rows="1"
      :placeholder="thread ? 'Reply…' : 'Add a comment…'"
      :aria-label="thread ? 'Reply' : 'Comment'"
      :disabled="comments.busy"
      @input="grow"
      @keydown="onKeydown"
    />

    <footer class="mech-comment-card__actions">
      <template v-if="thread && confirming">
        <span class="mech-comment-card__confirm">Delete this thread?</span>
        <button type="button" class="mech-button is-danger" data-action="delete-yes" :disabled="comments.busy" @click="remove">Yes</button>
        <button type="button" class="mech-button" data-action="delete-no" @click="confirming = false">No</button>
      </template>
      <template v-else-if="thread">
        <button
          type="button"
          class="mech-icon-button is-danger"
          title="Delete thread"
          data-action="delete"
          :disabled="comments.busy"
          @click="confirming = true"
        >
          <VIcon name="trash" />
        </button>
        <span class="mech-comment-card__gap" />
        <button
          v-if="text.trim()"
          type="button"
          class="mech-button"
          data-action="reply"
          title="Send (Enter)"
          :disabled="comments.busy"
          @click="send"
        >
          Reply
        </button>
        <button
          v-if="thread.status === 'open'"
          type="button"
          class="mech-button is-primary"
          data-action="resolve"
          :disabled="comments.busy"
          @click="comments.resolve(thread.id)"
        >
          Resolve
        </button>
        <button
          v-else
          type="button"
          class="mech-button"
          data-action="reopen"
          :disabled="comments.busy"
          @click="comments.reopen(thread.id)"
        >
          Reopen
        </button>
      </template>
      <template v-else>
        <span class="mech-comment-card__gap" />
        <button type="button" class="mech-button" data-action="cancel" @click="close">Cancel</button>
        <button
          type="button"
          class="mech-button is-primary"
          data-action="comment"
          title="Send (Enter)"
          :disabled="!text.trim() || comments.busy"
          @click="send"
        >
          Comment
        </button>
      </template>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUpdated, ref } from 'vue'
import type { CommentThread } from 'mechanica-shared'
import {
  cardPosition,
  commentsKey,
  initials,
  relativeTime,
  viewportHint,
  EDITOR_PANEL_WIDTH,
  type Point,
} from '../lib/comments'
import VIcon from './VIcon.vue'

const props = defineProps<{
  /** The thread to show; null is the "new comment" form for the store's draft. */
  thread: CommentThread | null
  /** The pin the card sits beside; null docks it to the comments panel. */
  point: Point | null
  /** Where the thread is, in words (block name / "Whole page" / "Block removed"). */
  place: string
  /** The room the side panels take on each side (px); absent = their usual width. */
  inset?: number
}>()

const comments = inject(commentsKey)!

const cardRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const text = ref('')
const confirming = ref(false)

const anchor = computed(() => (props.thread ? props.thread.anchor : comments.draft?.anchor) ?? null)
const quoteText = computed(() => anchor.value?.quote ?? '')
const hint = computed(() => viewportHint(anchor.value, document.documentElement.clientWidth))

// The card's own box, measured after each render, so it can be kept inside
// the viewport and clear of the side panels.
const size = ref({ width: 300, height: 220 })
function measure(): void {
  const el = cardRef.value
  if (!el || !el.offsetWidth) return
  if (el.offsetWidth !== size.value.width || el.offsetHeight !== size.value.height) {
    size.value = { width: el.offsetWidth, height: el.offsetHeight }
  }
}
onUpdated(measure)

const style = computed(() => {
  // Docked: beside the comments panel, or at the screen edge when it is hidden.
  if (!props.point) return props.inset == null ? undefined : { right: `${props.inset + 12}px` }
  const root = document.documentElement
  const { left, top } = cardPosition(
    props.point,
    size.value,
    { width: root.clientWidth, height: root.clientHeight },
    { left: props.inset ?? EDITOR_PANEL_WIDTH, right: props.inset ?? EDITOR_PANEL_WIDTH },
  )
  return { transform: `translate(${left}px, ${top}px)` }
})

const fullDate = (iso: string): string => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

// Grow the box with its text, up to the CSS max-height.
function grow(): void {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}

function scrollToEnd(): void {
  const el = scrollRef.value
  if (el) el.scrollTop = el.scrollHeight
}

onMounted(() => {
  measure()
  scrollToEnd()
  // A new comment starts in its text box; a thread is read first.
  if (!props.thread) inputRef.value?.focus({ preventScroll: true })
})

function close(): void {
  if (props.thread) comments.openThread(null)
  else comments.cancelDraft()
}

async function send(): Promise<void> {
  const body = text.value.trim()
  if (!body || comments.busy) return
  if (!props.thread) {
    // On success the draft's card gives way to the new thread's.
    await comments.submitDraft(body)
    return
  }
  if (!(await comments.reply(props.thread.id, body))) return
  text.value = ''
  await nextTick()
  grow()
  scrollToEnd()
  inputRef.value?.focus({ preventScroll: true })
}

function onKeydown(event: KeyboardEvent): void {
  // Enter sends, Shift+Enter breaks the line; an IME's confirming Enter is neither.
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void send()
}

async function remove(): Promise<void> {
  if (!props.thread) return
  if (!(await comments.remove(props.thread.id))) confirming.value = false
}
</script>

<style lang="scss" scoped>
.mech-comment-card {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147482700; // over the pins, under the side panels
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 300px;
  max-height: min(70vh, 520px);
  padding: 10px 12px 12px;
  box-sizing: border-box;
  background: var(--mech-bg);
  border: 1px solid var(--mech-border);
  border-radius: 12px;
  box-shadow: var(--mech-shadow-pop);
  font-family: var(--mech-font);
  font-size: 13px;
  color: var(--mech-fg);

  // No pin to sit beside (a page-level thread, or its block is gone): hang off
  // the comments panel's inner edge instead.
  &.is-docked {
    top: 56px;
    left: auto;
    right: calc(var(--mech-panel-width) + 12px);
  }
}
.mech-comment-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -2px -4px -2px 0;
}
.mech-comment-card__place {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--mech-fg-alt);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mech-comment-card__hint {
  flex: none;
  padding: 1px 7px;
  border-radius: var(--mech-radius-pill);
  background: var(--mech-field-bg);
  color: var(--mech-muted);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
.mech-comment-card__scroll {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;

  &:empty {
    display: none;
  }
}
.mech-comment-card__quote {
  margin: 0;
  padding: 2px 0 2px 10px;
  border-left: 2px solid var(--mech-border-strong);
  color: var(--mech-muted);
  font-size: 12.5px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.mech-comment-card__messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.mech-comment-card__message {
  display: flex;
  gap: 9px;
}
.mech-comment-card__content {
  flex: 1;
  min-width: 0;
}
.mech-comment-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
}
.mech-comment-card__author {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
// A quiet marker on an agent's messages — informative, not a badge of honor.
.mech-comment-card__tag {
  flex: none;
  padding: 0 5px;
  border: 1px solid var(--mech-border-strong);
  border-radius: 5px;
  color: var(--mech-muted);
  font-size: 10px;
  font-weight: 600;
  line-height: 15px;
  letter-spacing: 0.03em;
}
.mech-comment-card__time {
  flex: none;
  margin-left: auto;
  color: var(--mech-muted);
  font-size: 11.5px;
  white-space: nowrap;
}
.mech-comment-card__body {
  margin: 1px 0 0;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.mech-comment-card__resolved {
  margin: 0;
  color: var(--mech-muted);
  font-size: 11.5px;
}
.mech-comment-card__input {
  flex: none;
  height: auto;
  min-height: 36px;
  max-height: 140px;
  padding: 8px 11px;
  font-size: 13px;
  line-height: 1.4;
  resize: none;
}
.mech-comment-card__actions {
  display: flex;
  align-items: center;
  gap: 6px;

  .mech-button {
    height: 30px;
    padding: 0 13px;
  }
}
.mech-comment-card__gap {
  flex: 1;
}
.mech-comment-card__confirm {
  flex: 1;
  color: var(--mech-fg-alt);
  font-size: 12.5px;
}
</style>
