import { describe, it, expect } from 'vitest'
import {
  anchorForBlock,
  blockAtPath,
  blockPathOf,
  openCommentCount,
  resolveAnchor,
  type CommentAnchor,
  type CommentThread,
} from '@/comments'
import type { ContentBlock } from '@/types'

const block = (id: string, blockId: string, children?: ContentBlock['children']): ContentBlock => ({
  id,
  blockId,
  data: {},
  ...(children ? { children } : {}),
})

/**
 * hero
 * section            (default slot)
 *   ├ card #card-a
 *   └ card #card-b
 * columns            (named slots)
 *   start: text #left
 *   end:   text #right, cta #cta
 */
const tree = (): ContentBlock[] => [
  block('hero', 'hero'),
  block('section', 'section', [block('card-a', 'card'), block('card-b', 'card')]),
  block('columns', 'columns', {
    start: [block('left', 'text')],
    end: [block('right', 'text'), block('cta', 'cta')],
  }),
]

describe('comments: block paths', () => {
  it('finds a root block, a default-slot child and a named-slot child', () => {
    const content = tree()
    expect(blockPathOf(content, 'hero')).toEqual([0])
    expect(blockPathOf(content, 'card-b')).toEqual([1, 1])
    expect(blockPathOf(content, 'left')).toEqual([2, 'start', 0])
    expect(blockPathOf(content, 'cta')).toEqual([2, 'end', 1])
  })

  it('answers null for an id that is not in the tree', () => {
    expect(blockPathOf(tree(), 'nope')).toBeNull()
    expect(blockPathOf([], 'hero')).toBeNull()
  })

  it('walks a path back to the block', () => {
    const content = tree()
    expect(blockAtPath(content, [0])?.id).toBe('hero')
    expect(blockAtPath(content, [1, 1])?.id).toBe('card-b')
    expect(blockAtPath(content, [2, 'start', 0])?.id).toBe('left')
    expect(blockAtPath(content, [2, 'end', 1])?.id).toBe('cta')
  })

  it('answers null where the tree has nothing', () => {
    const content = tree()
    expect(blockAtPath(content, [])).toBeNull()
    expect(blockAtPath(content, [9])).toBeNull()
    expect(blockAtPath(content, [1, 5])).toBeNull()
    // A default-slot index into a block with no children, or with named slots.
    expect(blockAtPath(content, [0, 0])).toBeNull()
    expect(blockAtPath(content, [2, 0])).toBeNull()
    // A slot name on a block with a default slot, and a slot that is not there.
    expect(blockAtPath(content, [1, 'start', 0])).toBeNull()
    expect(blockAtPath(content, [2, 'middle', 0])).toBeNull()
  })

  it('round-trips every block of the tree', () => {
    const content = tree()
    for (const id of ['hero', 'section', 'card-a', 'card-b', 'columns', 'left', 'right', 'cta']) {
      expect(blockAtPath(content, blockPathOf(content, id)!)?.id).toBe(id)
    }
  })
})

describe('comments: anchorForBlock', () => {
  it('records the id, the type and the position', () => {
    expect(anchorForBlock(tree(), 'right')).toEqual({ blockId: 'right', blockType: 'text', path: [2, 'end', 0] })
  })

  it('keeps the extras that are set and drops the empty ones', () => {
    expect(
      anchorForBlock(tree(), 'hero', { field: 'title', quote: '', x: 0, y: 0.5, viewport: undefined }),
    ).toEqual({ blockId: 'hero', blockType: 'hero', path: [0], field: 'title', x: 0, y: 0.5 })
  })

  it('answers null for a block that is not in the tree', () => {
    expect(anchorForBlock(tree(), 'nope')).toBeNull()
  })
})

describe('comments: resolveAnchor', () => {
  it('finds the block by its id, wherever it moved', () => {
    const content = tree()
    const anchor = anchorForBlock(content, 'card-b')!
    // The card moves to the root, in front of everything.
    const [card] = (content[1]!.children as ContentBlock[]).splice(1, 1)
    content.unshift(card!)

    const found = resolveAnchor(content, anchor)
    expect(found).toMatchObject({ via: 'id', path: [0] })
    expect(found!.block).toBe(card)
  })

  it('falls back to the old position when the id now names a block of another type', () => {
    // Positional ids: a block inserted above shifts every `autoN` below it.
    const before = [block('auto1', 'hero'), block('auto2', 'pricing')]
    const anchor = anchorForBlock(before, 'auto2')!
    const after = [block('auto1', 'hero'), block('auto3', 'pricing'), block('auto2', 'footer')]

    const found = resolveAnchor(after, anchor)
    expect(found).toMatchObject({ via: 'path', path: [1] })
    expect(found!.block.id).toBe('auto3')
  })

  it('falls back to the type when the position holds something else and the type is unique', () => {
    const anchor: CommentAnchor = { blockId: 'gone', blockType: 'cta', path: [0] }
    const found = resolveAnchor(tree(), anchor)
    expect(found).toMatchObject({ via: 'type', path: [2, 'end', 1] })
    expect(found!.block.id).toBe('cta')
  })

  it('answers null when the type is ambiguous', () => {
    const anchor: CommentAnchor = { blockId: 'gone', blockType: 'card', path: [0] }
    expect(resolveAnchor(tree(), anchor)).toBeNull()
  })

  it('answers null when no block of the type is left', () => {
    const anchor: CommentAnchor = { blockId: 'gone', blockType: 'pricing', path: [7] }
    expect(resolveAnchor(tree(), anchor)).toBeNull()
    expect(resolveAnchor([], anchor)).toBeNull()
  })
})

describe('comments: openCommentCount', () => {
  it('counts the open threads', () => {
    const thread = (status: CommentThread['status']): CommentThread => ({
      id: 'c_1',
      page: '/',
      status,
      messages: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    expect(openCommentCount([])).toBe(0)
    expect(openCommentCount([thread('open'), thread('resolved'), thread('open')])).toBe(2)
  })
})
