import { describe, it, expect } from 'vitest'
import { registerFieldSchemas } from '@mechanica/shared'
import type { ContentBlock } from '@mechanica/shared'
import { findBlock, removeBlock, uid } from '@/editor/content-tree'
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
