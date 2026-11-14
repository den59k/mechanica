import type { ContentBlock } from './types'

/**
 * Review comments on a site's pages: threads pinned to a block (or to the page
 * as a whole), written in the editor and read by people and by coding agents
 * (`mechanica comments`). They are workflow state, not content — they never
 * live in a page file and are not part of what a site publishes.
 */

/** Who wrote a message. The host decides it; a client never names its own author. */
export interface CommentAuthor {
  name: string
  /** A person, or a coding agent acting on the comments. */
  kind: 'user' | 'agent'
  /** The host's id for the account, when it has accounts. */
  id?: string
}

export interface CommentMessage {
  id: string
  author: CommentAuthor
  /** Plain text; line breaks are kept. */
  body: string
  /** ISO 8601. */
  createdAt: string
}

/**
 * The element inside the block a comment was pinned on, described the way it
 * can be found again in the sources — its tag and classes in the block's
 * component, its text in the page file. Deliberately not a DOM path: that
 * breaks with the first markup fix, and nobody edits the DOM.
 */
export interface CommentElement {
  /** Lowercase tag name: `h2`, `button`, `img`. */
  tag: string
  /** The element's own classes (a few at most). */
  classes?: string[]
  /** The start of its text, whitespace collapsed. */
  text?: string
}

/** One step of a block's position in the content tree: an index, or the name of the slot the next index is in. */
export type BlockPathSegment = number | string

/**
 * Where a thread is pinned. A block is found again by its id, and when the id
 * is gone (a hand-authored page has positional `autoN` ids) by where it was and
 * what it is — see {@link resolveAnchor}.
 */
export interface CommentAnchor {
  /** The content block's id (`ContentBlock.id`) when the comment was made. */
  blockId: string
  /** The block's component id (`ContentBlock.blockId`), e.g. `pricing`. */
  blockType: string
  /**
   * The block's position in the tree: `[2]` is the third root block, `[2, 0]`
   * its first default-slot child, `[2, 'start', 0]` the first child of its
   * `start` slot.
   */
  path: BlockPathSegment[]
  /** The prop the comment is about, as a dotted path (`plans.1.price`). */
  field?: string
  /** The text that was selected when the comment was made. */
  quote?: string
  /** The element that was clicked. */
  element?: CommentElement
  /** The pin's place inside the block's box, as fractions (0–1) of its width and height. */
  x?: number
  y?: number
  /** The viewport width (px) the comment was made at — "this is about the mobile layout". */
  viewport?: number
}

export type CommentStatus = 'open' | 'resolved'

export interface CommentThread {
  id: string
  /** The page's logical path (`/pricing`), never locale-prefixed. */
  page: string
  /** The locale the page was viewed in; absent for the default locale and single-language sites. */
  locale?: string
  /** Absent for a comment on the page as a whole. */
  anchor?: CommentAnchor
  status: CommentStatus
  /** At least one; the first is the comment itself, the rest are replies. */
  messages: CommentMessage[]
  /** ISO 8601. */
  createdAt: string
  resolvedAt?: string
  resolvedBy?: CommentAuthor
}

// ── The editor ⇄ host wire shapes ────────────────────────────────────────────

/** `POST /comments` — start a thread. */
export interface NewCommentRequest {
  page: string
  locale?: string
  anchor?: CommentAnchor
  body: string
}

/** `POST /comments/reply` */
export interface CommentReplyRequest {
  id: string
  body: string
}

/** `POST /comments/status` */
export interface CommentStatusRequest {
  id: string
  status: CommentStatus
}

// ── Anchoring ────────────────────────────────────────────────────────────────

const childLists = (block: ContentBlock): [slot: string | null, list: ContentBlock[]][] => {
  if (!block.children) return []
  if (Array.isArray(block.children)) return [[null, block.children]]
  return Object.entries(block.children)
}

/** The position of the block with content-block id `id`, or null when it is not in the tree. */
export function blockPathOf(content: ContentBlock[], id: string): BlockPathSegment[] | null {
  for (let index = 0; index < content.length; index++) {
    const block = content[index]!
    if (block.id === id) return [index]
    for (const [slot, list] of childLists(block)) {
      const inner = blockPathOf(list, id)
      if (inner) return slot === null ? [index, ...inner] : [index, slot, ...inner]
    }
  }
  return null
}

/** The block at a position, or null when the tree has nothing there. */
export function blockAtPath(content: ContentBlock[], path: BlockPathSegment[]): ContentBlock | null {
  let list: ContentBlock[] | undefined = content
  // The children of the block the walk is at; undefined before the first index.
  let children: ContentBlock['children']
  let block: ContentBlock | null = null
  for (let i = 0; i < path.length; i++) {
    const segment = path[i]!
    if (typeof segment === 'string') {
      // A slot name: the list the next index points into.
      list = children && !Array.isArray(children) ? children[segment] : undefined
      continue
    }
    // An index right after a block means its default slot.
    if (i > 0 && typeof path[i - 1] === 'number') list = Array.isArray(children) ? children : undefined
    block = list?.[segment] ?? null
    if (!block) return null
    children = block.children
  }
  return block
}

/** An anchor for the block with content-block id `id`; null when it is not in the tree. */
export function anchorForBlock(
  content: ContentBlock[],
  id: string,
  extra: Pick<CommentAnchor, 'field' | 'quote' | 'element' | 'x' | 'y' | 'viewport'> = {},
): CommentAnchor | null {
  const path = blockPathOf(content, id)
  const block = path && blockAtPath(content, path)
  if (!path || !block) return null
  const anchor: CommentAnchor = { blockId: id, blockType: block.blockId, path }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== '') (anchor as unknown as Record<string, unknown>)[key] = value
  }
  return anchor
}

export interface ResolvedAnchor {
  block: ContentBlock
  /** The block's position now. */
  path: BlockPathSegment[]
  /**
   * How it was found: by its id, at its old position, or as the only block of
   * its type on the page — in falling order of confidence.
   */
  via: 'id' | 'path' | 'type'
}

/**
 * Find the block a thread is pinned to in the page as it is now. The id is
 * trusted only while it still names a block of the same type (an `autoN` id
 * shifts when blocks are inserted above it); then the old position, then the
 * type alone when that is unambiguous. Null means the block is gone — the
 * thread is shown on the page as a whole, never dropped.
 */
export function resolveAnchor(content: ContentBlock[], anchor: CommentAnchor): ResolvedAnchor | null {
  const byIdPath = blockPathOf(content, anchor.blockId)
  const byId = byIdPath && blockAtPath(content, byIdPath)
  if (byIdPath && byId && byId.blockId === anchor.blockType) return { block: byId, path: byIdPath, via: 'id' }

  const atPath = blockAtPath(content, anchor.path)
  if (atPath && atPath.blockId === anchor.blockType) return { block: atPath, path: anchor.path, via: 'path' }

  const sameType: ContentBlock[] = []
  const collect = (list: ContentBlock[]): void => {
    for (const block of list) {
      if (block.blockId === anchor.blockType) sameType.push(block)
      for (const [, children] of childLists(block)) collect(children)
    }
  }
  collect(content)
  if (sameType.length === 1) {
    const block = sameType[0]!
    return { block, path: blockPathOf(content, block.id) ?? anchor.path, via: 'type' }
  }
  return null
}

/** How many of the threads are open. */
export const openCommentCount = (threads: CommentThread[]): number =>
  threads.reduce((count, thread) => count + (thread.status === 'open' ? 1 : 0), 0)
