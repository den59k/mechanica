import { describe, it, expect } from 'vitest'
import { registerFieldSchemas } from '@mechanica/shared'
import type { ContentBlock } from '@mechanica/shared'
import { findBlock, removeBlock, moveBlock, duplicateBlock, uid } from '@/editor/content-tree'
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
