import { reactive, type InjectionKey } from 'vue'
import {
  anchorForBlock,
  blockAtPath,
  blockPathOf,
  openCommentCount,
  resolveAnchor,
  type CommentAnchor,
  type CommentElement,
  type CommentThread,
  type ContentBlock,
} from 'mechanica-shared'
import type { EditorBackend } from './backend'
import { blockElement, blockRect, type BlockRect } from './use-block-frames'

/**
 * Review comments in the editor: where a pin sits, which block a thread is on
 * now, how its text reads — and the reactive store behind the comment mode.
 * The threads themselves live with the host (`backend.comments`), never in the
 * page content.
 */

// ── Pure helpers ─────────────────────────────────────────────────────────────

export interface Point {
  left: number
  top: number
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)
const round3 = (value: number): number => Math.round(value * 1000) / 1000

/** How far inside the block's top-right corner a pin without a click point sits. */
const CORNER_INSET = 16

/**
 * The viewport point a thread's pin marks, from its block's live rect and the
 * anchor's fractions. An anchor without a click point (a comment made by an
 * agent, or on a block as a whole) sits just inside the top-right corner. The
 * point never leaves the block's box.
 */
export function pinPoint(rect: BlockRect, anchor: Pick<CommentAnchor, 'x' | 'y'> = {}): Point {
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  const left = anchor.x == null ? right - CORNER_INSET : rect.left + clamp(anchor.x, 0, 1) * rect.width
  const top = anchor.y == null ? rect.top + CORNER_INSET : rect.top + clamp(anchor.y, 0, 1) * rect.height
  return { left: clamp(left, rect.left, right), top: clamp(top, rect.top, bottom) }
}

/** The longest quote an anchor keeps. */
export const QUOTE_LIMIT = 200

/** A selection as an anchor quote: whitespace collapsed, trimmed and capped; undefined when empty. */
export function trimQuote(text: string | null | undefined): string | undefined {
  const quote = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!quote) return undefined
  return quote.length > QUOTE_LIMIT ? `${quote.slice(0, QUOTE_LIMIT - 1).trimEnd()}…` : quote
}

/**
 * The anchor for a click on a block: the block's place in the tree plus the
 * click point as fractions of its box, the viewport width, the text that was
 * selected, and (`extra`) what was clicked: the element and the prop it shows. Null when the block is not in the content.
 */
export function anchorFromClick(
  content: ContentBlock[],
  contentBlockId: string,
  rect: Pick<BlockRect, 'top' | 'left' | 'width' | 'height'>,
  clientX: number,
  clientY: number,
  viewportWidth: number,
  quote?: string | null,
  extra: Pick<CommentAnchor, 'element' | 'field'> = {},
): CommentAnchor | null {
  const fraction = (offset: number, size: number) => (size > 0 ? round3(clamp(offset / size, 0, 1)) : 0)
  return anchorForBlock(content, contentBlockId, {
    x: fraction(clientX - rect.left, rect.width),
    y: fraction(clientY - rect.top, rect.height),
    viewport: viewportWidth > 0 ? Math.round(viewportWidth) : undefined,
    quote: trimQuote(quote),
    element: extra.element,
    field: extra.field,
  })
}

/** The text selected inside `block` (a selection elsewhere on the page is not about this block). */
export function quoteFromSelection(
  selection: Pick<Selection, 'isCollapsed' | 'anchorNode' | 'toString'> | null | undefined,
  block: Pick<Node, 'contains'> | null,
): string | undefined {
  if (!selection || selection.isCollapsed || !block || !selection.anchorNode) return undefined
  if (!block.contains(selection.anchorNode)) return undefined
  return trimQuote(selection.toString())
}

/** The longest element text an anchor keeps. */
export const ELEMENT_TEXT_LIMIT = 120

const collapse = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim()

/**
 * The clicked element as an anchor keeps it: tag, its own classes and the start
 * of its text — things a person (or an agent) can search the sources for.
 * A click inside an inline SVG describes the `<svg>`, not one of its paths.
 * Undefined for a click on the block's own root (the block is already named)
 * or outside the block.
 */
export function describeElement(target: Element | null, block: Element | null): CommentElement | undefined {
  if (!target || !block || target === block || !block.contains(target)) return undefined
  const element = target.closest?.('svg') ?? target
  if (element === block) return undefined
  const described: CommentElement = { tag: element.tagName.toLowerCase() }
  const classes = [...element.classList].slice(0, 6)
  if (classes.length) described.classes = classes
  const text = collapse(element.textContent)
  if (text) {
    described.text = text.length > ELEMENT_TEXT_LIMIT ? `${text.slice(0, ELEMENT_TEXT_LIMIT - 1).trimEnd()}…` : text
  }
  return described
}

/** A value path deeper than this is cut to its first key — `body`, not a rich-text node's address. */
const FIELD_DEPTH_LIMIT = 3
/** Texts shorter than this are too common ("OK", "→") to tell which prop they came from. */
const FIELD_MIN_TEXT = 3

/**
 * The prop of a block that an element's text comes from, as a dotted path
 * (`title`, `plans.1.price`): the one string in the block's data that equals
 * the text, or else the one that contains it. Undefined when nothing matches or
 * several props do — a wrong field would mislead more than a missing one.
 */
export function fieldForText(data: unknown, text: string | null | undefined): string | undefined {
  const wanted = collapse(text)
  if (wanted.length < FIELD_MIN_TEXT) return undefined
  const equal = new Set<string>()
  const containing = new Set<string>()
  const visit = (value: unknown, path: string[]): void => {
    if (typeof value === 'string') {
      const have = collapse(value)
      if (!have) return
      const field = path.length > FIELD_DEPTH_LIMIT ? path[0]! : path.join('.')
      if (have === wanted) equal.add(field)
      else if (have.includes(wanted)) containing.add(field)
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, String(index)]))
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) visit(item, [...path, key])
    }
  }
  visit(data, [])
  if (equal.size === 1) return [...equal][0]
  if (equal.size === 0 && containing.size === 1) return [...containing][0]
  return undefined
}

export interface PlacedThreads {
  /** Threads whose block is on the page, with that block's id as it is now. */
  pinned: { thread: CommentThread; blockId: string }[]
  /** Threads on the page as a whole, and threads whose block is gone. */
  unpinned: CommentThread[]
  /** The ids of the unpinned threads that had a block — "its block was removed". */
  removedIds: string[]
}

/** Sort a page's threads onto its blocks as they are now. Order is kept. */
export function placeThreads(content: ContentBlock[], threads: CommentThread[]): PlacedThreads {
  const placed: PlacedThreads = { pinned: [], unpinned: [], removedIds: [] }
  for (const thread of threads) {
    const found = thread.anchor ? resolveAnchor(content, thread.anchor) : null
    if (found) {
      placed.pinned.push({ thread, blockId: found.block.id })
      continue
    }
    placed.unpinned.push(thread)
    if (thread.anchor) placed.removedIds.push(thread.id)
  }
  return placed
}

/** Where a thread is, in words: its block's name, "Whole page", or "Block removed". */
export function threadPlace(
  thread: Pick<CommentThread, 'anchor'>,
  removed: boolean,
  blockName: (blockType: string) => string | undefined,
): string {
  if (!thread.anchor) return 'Whole page'
  if (removed) return 'Block removed'
  return blockName(thread.anchor.blockType) || thread.anchor.blockType
}

/** A page's threads in list order: open ones first, the newest first within each group. */
export function sortThreads(threads: CommentThread[]): CommentThread[] {
  return [...threads].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    return b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0
  })
}

/** "just now", "5 min ago", "2 h ago", "yesterday", then a short date. */
export function relativeTime(iso: string, now: Date | number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const current = typeof now === 'number' ? now : now.getTime()
  const minutes = Math.floor(Math.max(0, current - then) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  if (hours < 48) return 'yesterday'
  const date = new Date(then)
  const sameYear = date.getFullYear() === new Date(current).getFullYear()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** Up to two initials of a name, for an avatar; `?` for an empty one. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/[\s._-]+/).filter(Boolean)
  if (!words.length) return '?'
  const first = [...words[0]!][0]!
  const last = words.length > 1 ? [...words[words.length - 1]!][0]! : ''
  return (first + last).toUpperCase()
}

/** The viewport widths differ enough that the comment is likely about another layout. */
const VIEWPORT_TOLERANCE = 40

/** "at 390px" when the comment was made at a notably different viewport width; else null. */
export function viewportHint(
  anchor: Pick<CommentAnchor, 'viewport'> | null | undefined,
  viewportWidth: number,
): string | null {
  const made = anchor?.viewport
  if (!made || Math.abs(made - viewportWidth) <= VIEWPORT_TOLERANCE) return null
  return `at ${made}px`
}

/** The text "Copy for Claude" puts on the clipboard: how an agent reads and answers a page's comments. */
export function agentPrompt(pagePath: string): string {
  return (
    `Address the open review comments on the page ${pagePath}. ` +
    `Run \`npx mechanica comments --page ${pagePath}\` to read them (each one names the block, the file and the line). ` +
    'After fixing one, run `npx mechanica comments resolve <id> --note "what you changed"`; ' +
    'if something is unclear, ask with `npx mechanica comments reply <id> "question"` instead of guessing.'
  )
}

/** The pin marker's size (px); its bottom-left corner sits on the pin point. */
export const PIN_SIZE = 24

/** The width (px) of the editor's side panels (`--mech-panel-width`), which overlay the page's edges. */
export const EDITOR_PANEL_WIDTH = 300

/**
 * Where a thread card goes: beside its pin (right of it, flipped to the left
 * when that would run under the right panel), kept inside the viewport and
 * clear of the side panels (`insets`).
 */
export function cardPosition(
  point: Point,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  insets: { left: number; right: number } = { left: 0, right: 0 },
): Point {
  const GAP = 10
  const MARGIN = 12
  const minLeft = insets.left + MARGIN
  const maxLeft = Math.max(minLeft, viewport.width - insets.right - MARGIN - size.width)
  let left = point.left + PIN_SIZE + GAP
  if (left > maxLeft) {
    const flipped = point.left - GAP - size.width
    left = flipped >= minLeft ? flipped : maxLeft
  }
  const maxTop = Math.max(MARGIN, viewport.height - size.height - MARGIN)
  return {
    left: Math.round(clamp(left, minLeft, maxLeft)),
    top: Math.round(clamp(point.top - PIN_SIZE, MARGIN, maxTop)),
  }
}

// ── The store ────────────────────────────────────────────────────────────────

/** A comment being written: pinned to a block (`anchor`), or on the page as a whole (`anchor: null`). */
export interface CommentDraft {
  anchor: CommentAnchor | null
}

export interface CommentsStoreOptions {
  /** The site's default locale: a thread made in it carries no `locale`. */
  defaultLocale?: string | null
}

export interface CommentsStore {
  /** The host has comments: false until the first list arrives, and for good when the host has none. */
  available: boolean
  /** The current page's threads, as the host returned them. */
  threads: CommentThread[]
  /** Comment mode: clicks on the page pin comments instead of selecting blocks. */
  mode: boolean
  /** The open thread. */
  activeId: string | null
  /** The comment being written, if any. */
  draft: CommentDraft | null
  /** Whether resolved threads are listed and pinned. */
  showResolved: boolean
  /** The last failure, for the panel to show; cleared by the next write. */
  error: string | null
  /** A write is in flight. */
  busy: boolean
  /** The logical path of the page the threads belong to; set by `load`. */
  page: string | null
  /** How many of the page's threads are open. */
  readonly openCount: number
  /** The threads to show: open first, resolved only when `showResolved`. */
  readonly visibleThreads: CommentThread[]
  /** The open thread, when it is among the visible ones. */
  readonly active: CommentThread | null

  /** Point the store at a page (its logical path) and the locale it is viewed in, and load its threads. */
  load(page: string, locale?: string | null): Promise<void>
  /** Re-read the current page's threads. */
  refresh(): Promise<void>
  toggleMode(): void
  /** Start writing a comment at an anchor, or on the whole page (`null`). Closes the open thread. */
  startDraft(anchor: CommentAnchor | null): void
  cancelDraft(): void
  /** Send the draft; the new thread becomes the open one. Null when it failed (see `error`). */
  submitDraft(body: string): Promise<CommentThread | null>
  reply(id: string, body: string): Promise<boolean>
  resolve(id: string): Promise<boolean>
  reopen(id: string): Promise<boolean>
  remove(id: string): Promise<boolean>
  /** Open a thread (dropping a draft), or close the open one with `null`. */
  openThread(id: string | null): void
  /**
   * One step back, for Esc: cancel the draft or close the open thread, else
   * leave comment mode. False when there was nothing to step out of.
   */
  escape(): boolean
  /** Stop listening for changes made elsewhere. */
  dispose(): void
}

export const commentsKey: InjectionKey<CommentsStore> = Symbol('mech-comments')

/**
 * The reactive state of the comment mode over a host's comments API. Writes
 * apply the thread the host answers with — authors and ids are the host's to
 * decide — and a failure lands in `error` rather than rejecting.
 */
export function createCommentsStore(
  backend: Pick<EditorBackend, 'comments' | 'onCommentsChange'>,
  options: CommentsStoreOptions = {},
): CommentsStore {
  let locale: string | undefined
  // Guards against a slow list landing after a newer one (or after a page switch).
  let request = 0
  // The host answered "no comments" before it ever listed any: stop asking.
  let unsupported = false

  const messageOf = (error: unknown, fallback: string): string =>
    (error instanceof Error && error.message) || fallback

  async function fetchThreads(): Promise<void> {
    const page = state.page
    if (unsupported || page == null) return
    const token = ++request
    let threads: CommentThread[] | null
    try {
      threads = await backend.comments.list(page)
    } catch {
      threads = null
    }
    if (token !== request) return
    if (!threads) {
      // A host that listed comments before only hiccuped: keep what is shown.
      if (!state.available) unsupported = true
      return
    }
    state.available = true
    state.threads = threads
    if (state.activeId && !threads.some((thread) => thread.id === state.activeId)) state.activeId = null
  }

  /** Put the host's version of a thread in place (appending a new one). */
  function apply(thread: CommentThread): void {
    if (thread.page !== state.page) return
    const at = state.threads.findIndex((entry) => entry.id === thread.id)
    if (at === -1) state.threads.push(thread)
    else state.threads.splice(at, 1, thread)
  }

  async function write<T>(fallback: string, run: () => Promise<T>): Promise<T | null> {
    state.busy = true
    state.error = null
    try {
      return await run()
    } catch (error) {
      state.error = messageOf(error, fallback)
      return null
    } finally {
      state.busy = false
    }
  }

  async function setStatus(id: string, status: 'open' | 'resolved'): Promise<boolean> {
    const thread = await write('Could not update the comment', () => backend.comments.setStatus(id, status))
    if (!thread) return false
    apply(thread)
    // A thread that just left the list takes its card with it.
    if (status === 'resolved' && !state.showResolved && state.activeId === id) state.activeId = null
    return true
  }

  const state: CommentsStore = reactive<CommentsStore>({
    available: false,
    threads: [],
    mode: false,
    activeId: null,
    draft: null,
    showResolved: false,
    error: null,
    busy: false,
    page: null,
    get openCount(): number {
      return openCommentCount(state.threads)
    },
    get visibleThreads(): CommentThread[] {
      const sorted = sortThreads(state.threads)
      return state.showResolved ? sorted : sorted.filter((thread) => thread.status === 'open')
    },
    get active(): CommentThread | null {
      if (!state.activeId) return null
      return state.visibleThreads.find((thread) => thread.id === state.activeId) ?? null
    },

    load(page, nextLocale) {
      locale = nextLocale && nextLocale !== options.defaultLocale ? nextLocale : undefined
      if (page !== state.page) {
        // Another page: nothing of the old one carries over.
        state.page = page
        state.threads = []
        state.activeId = null
        state.draft = null
        state.error = null
      }
      return fetchThreads()
    },
    refresh: fetchThreads,

    toggleMode() {
      if (!state.available) return
      state.mode = !state.mode
      if (!state.mode) {
        state.draft = null
        state.activeId = null
      }
    },
    startDraft(anchor) {
      state.activeId = null
      state.draft = { anchor }
    },
    cancelDraft() {
      state.draft = null
    },
    async submitDraft(body) {
      const draft = state.draft
      const page = state.page
      const text = body.trim()
      if (!draft || page == null || !text) return null
      const thread = await write('Could not post the comment', () =>
        backend.comments.create({
          page,
          ...(locale ? { locale } : {}),
          ...(draft.anchor ? { anchor: draft.anchor } : {}),
          body: text,
        }),
      )
      if (!thread) return null
      apply(thread)
      // Unless the draft was dropped or replaced while the write ran (Esc, the
      // mode left, a click elsewhere), the new thread takes its place.
      if (state.draft === draft) {
        state.draft = null
        state.activeId = thread.id
      }
      return thread
    },
    async reply(id, body) {
      const text = body.trim()
      if (!text) return false
      const thread = await write('Could not send the reply', () => backend.comments.reply(id, text))
      if (thread) apply(thread)
      return !!thread
    },
    resolve: (id) => setStatus(id, 'resolved'),
    reopen: (id) => setStatus(id, 'open'),
    async remove(id) {
      const removed = await write('Could not delete the comment', () => backend.comments.remove(id))
      if (removed === null) return false
      if (!removed) {
        state.error = 'Could not delete the comment'
        return false
      }
      state.threads = state.threads.filter((thread) => thread.id !== id)
      if (state.activeId === id) state.activeId = null
      return true
    },
    openThread(id) {
      state.activeId = id
      if (id) state.draft = null
    },
    escape() {
      if (state.draft) {
        state.draft = null
        return true
      }
      if (state.active) {
        state.activeId = null
        return true
      }
      if (!state.mode) return false
      state.mode = false
      state.activeId = null
      return true
    },
    dispose() {
      stop()
    },
  })

  // Comments written elsewhere — another tab, `mechanica comments` — show up live.
  const stop = backend.onCommentsChange(() => void fetchThreads())

  return state
}

/** What a click landed on inside a block: the element, and the block prop its text shows. */
function clickedIn(
  content: ContentBlock[],
  contentBlockId: string,
  target: EventTarget | null | undefined,
): Pick<CommentAnchor, 'element' | 'field'> {
  const element = describeElement(target instanceof Element ? target : null, blockElement(contentBlockId))
  if (!element) return {}
  const path = blockPathOf(content, contentBlockId)
  const block = path && blockAtPath(content, path)
  // The whole text decides the prop, not the capped copy the anchor keeps.
  const text = target instanceof Element ? (target.closest('svg') ?? target).textContent : element.text
  return { element, field: block ? fieldForText(block.data, text) : undefined }
}

/**
 * A click on a block of the live page while commenting: pin a new comment at
 * that point (keeping the text selected in the block as its quote) — or, with
 * a thread open, just close it, the way a click outside closes a popover.
 * Returns whether the click was taken (false outside comment mode).
 */
export function commentOnClick(
  comments: CommentsStore,
  content: ContentBlock[],
  contentBlockId: string,
  event: Pick<MouseEvent, 'clientX' | 'clientY'> & { target?: EventTarget | null },
): boolean {
  if (!comments.available || !comments.mode) return false
  if (comments.active) {
    comments.openThread(null)
    return true
  }
  const rect = blockRect(contentBlockId)
  if (!rect) return true
  const anchor = anchorFromClick(
    content,
    contentBlockId,
    rect,
    event.clientX,
    event.clientY,
    document.documentElement.clientWidth,
    quoteFromSelection(window.getSelection(), blockElement(contentBlockId)),
    clickedIn(content, contentBlockId, event.target),
  )
  if (anchor) comments.startDraft(anchor)
  return true
}
