import { describe, it, expect } from 'vitest'
import { registerFieldSchemas } from '@mechanica/shared'
import type { ContentBlock } from '@mechanica/shared'
import {
  findBlock,
  removeBlock,
  moveBlock,
  duplicateBlock,
  placeBlock,
  relocateBlock,
  uid,
} from '@/editor/content-tree'
import { toBlockMeta, createContentBlock } from '@/editor/block-meta'

registerFieldSchemas(() => {})

const tree = (): ContentBlock[] => [
  {
    id: '1',
    blockId: 'box',
    data: {},
    children: [{ id: '2', blockId: 'hero', data: {} }],
  },
  { id: '3', blockId: 'text', data: {}, children: { footer: [{ id: '4', blockId: 'link', data: {} }] } },
]

describe('content-tree', () => {
  it('finds blocks at any depth and slot', () => {
    expect(findBlock(tree(), '2')?.blockId).toBe('hero')
    expect(findBlock(tree(), '4')?.blockId).toBe('link')
    expect(findBlock(tree(), 'missing')).toBeNull()
  })

  it('removes blocks at any depth', () => {
    const t = tree()
    expect(removeBlock(t, '2')).toBe(true)
    expect(findBlock(t, '2')).toBeNull()
    expect(removeBlock(t, 'missing')).toBe(false)
  })

  it('generates unique ids', () => {
    expect(uid()).not.toBe(uid())
  })

  it('moves a block within its siblings and clamps at the edges', () => {
    const t: ContentBlock[] = [
      { id: '1', blockId: 'a', data: {} },
      { id: '2', blockId: 'b', data: {} },
      { id: '3', blockId: 'c', data: {} },
    ]
    expect(moveBlock(t, '3', -1)).toBe(true)
    expect(t.map((b) => b.id)).toEqual(['1', '3', '2'])
    expect(moveBlock(t, '1', -1)).toBe(false) // already first
    expect(t.map((b) => b.id)).toEqual(['1', '3', '2'])
  })

  it('duplicates a block after itself with fresh ids and cloned data', () => {
    const t: ContentBlock[] = [{ id: '1', blockId: 'a', data: { x: 1 } }]
    const clone = duplicateBlock(t, '1')!
    expect(t).toHaveLength(2)
    expect(clone.id).not.toBe('1')
    expect(clone.data).toEqual({ x: 1 })
    expect(clone.data).not.toBe(t[0]!.data)
  })

  it('places a block before/after an anchor or appends to root', () => {
    const t: ContentBlock[] = [
      { id: '1', blockId: 'a', data: {} },
      { id: '2', blockId: 'b', data: {} },
    ]
    placeBlock(t, { id: 'x', blockId: 'c', data: {} }, { anchorId: '1', position: 'after' })
    expect(t.map((b) => b.id)).toEqual(['1', 'x', '2'])
    placeBlock(t, { id: 'y', blockId: 'd', data: {} }, { anchorId: null, position: 'after' })
    expect(t.at(-1)!.id).toBe('y')
    placeBlock(t, { id: 'z', blockId: 'e', data: {} }, { anchorId: '1', position: 'before' })
    expect(t[0]!.id).toBe('z')
  })

  it('relocates across lists and refuses dropping a block into its own subtree', () => {
    const t: ContentBlock[] = [
      { id: '1', blockId: 'box', data: {}, children: [{ id: '2', blockId: 'a', data: {} }] },
      { id: '3', blockId: 'b', data: {} },
    ]
    expect(relocateBlock(t, '3', { anchorId: '2', position: 'before' })).toBe(true)
    expect(findBlock(t, '1')!.children).toEqual([
      { id: '3', blockId: 'b', data: {} },
      { id: '2', blockId: 'a', data: {} },
    ])
    expect(relocateBlock(t, '1', { anchorId: '2', position: 'before' })).toBe(false) // into own child
  })

  it('drops a block inside an empty container, creating a default slot', () => {
    const t: ContentBlock[] = [{ id: '1', blockId: 'box', data: {} }]
    placeBlock(t, { id: 'x', blockId: 'a', data: {} }, { anchorId: '1', position: 'inside' })
    expect(t[0]!.children).toEqual([{ id: 'x', blockId: 'a', data: {} }])
  })

  it('appends into a container that already has a default slot', () => {
    const t: ContentBlock[] = [
      { id: '1', blockId: 'box', data: {}, children: [{ id: '2', blockId: 'a', data: {} }] },
    ]
    placeBlock(t, { id: 'x', blockId: 'b', data: {} }, { anchorId: '1', position: 'inside' })
    expect((t[0]!.children as ContentBlock[]).map((b) => b.id)).toEqual(['2', 'x'])
  })

  it('drops into a named slot, promoting an existing array to the default key', () => {
    const t: ContentBlock[] = [
      { id: '1', blockId: 'box', data: {}, children: [{ id: '2', blockId: 'a', data: {} }] },
    ]
    placeBlock(t, { id: 'x', blockId: 'b', data: {} }, { anchorId: '1', position: 'inside', slot: 'footer' })
    const children = t[0]!.children as Record<string, ContentBlock[]>
    expect(children.default!.map((b) => b.id)).toEqual(['2'])
    expect(children.footer!.map((b) => b.id)).toEqual(['x'])
  })

  it('relocates a block inside a container and refuses nesting into its own subtree', () => {
    const t: ContentBlock[] = [
      { id: '1', blockId: 'box', data: {} },
      { id: '2', blockId: 'a', data: {} },
    ]
    expect(relocateBlock(t, '2', { anchorId: '1', position: 'inside' })).toBe(true)
    expect(findBlock(t, '1')!.children).toEqual([{ id: '2', blockId: 'a', data: {} }])
    expect(t).toHaveLength(1)
    expect(relocateBlock(t, '1', { anchorId: '2', position: 'inside' })).toBe(false) // into own child
  })
})

describe('block-meta', () => {
  it('derives metadata from a compiled component', () => {
    const meta = toBlockMeta({
      blockId: 'hero',
      __name: 'HeroBlock',
      blockSchema: { name: 'Hero', category: 'Content', props: { title: 'string' } },
    })
    expect(meta).toMatchObject({ id: 'hero', name: 'Hero', category: 'Content' })
    expect((meta.props as any).properties.title).toBeDefined()
  })

  it('names blocks from the filename when unnamed', () => {
    expect(toBlockMeta({ blockId: 'our-features', __name: 'OurFeatures' }).name).toBe('Our Features')
  })

  it('creates a placed block with a fresh id and default data', () => {
    const meta = toBlockMeta({ blockId: 'hero', blockSchema: { props: { title: 'string' } } })
    const block = createContentBlock(meta)
    expect(block.blockId).toBe('hero')
    expect(block.id).toBeTypeOf('string')
    expect(block.data).toHaveProperty('title')
  })
})
