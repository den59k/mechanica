import { describe, it, expect, vi } from 'vitest'
import type { Component } from 'vue'
import type { ContentBlock } from '@mechanica/shared'
import { loadBlocks, usedBlockIds, type BlockLoaders } from '@/core/load-blocks'

const Hero = { name: 'Hero' } as Component
const Card = { name: 'Card' } as Component

const loader = (component: Component) => vi.fn(async () => ({ default: component }))

describe('usedBlockIds', () => {
  it('collects ids across nested slot children, deduped', () => {
    const content: ContentBlock[] = [
      { id: '1', blockId: 'hero', data: {} },
      {
        id: '2',
        blockId: 'columns',
        data: {},
        children: { start: [{ id: '3', blockId: 'card', data: {} }], end: [{ id: '4', blockId: 'card', data: {} }] },
      },
    ]
    expect([...usedBlockIds(content)].sort()).toEqual(['card', 'columns', 'hero'])
  })
})

describe('loadBlocks', () => {
  it('loads only the blocks the content uses', async () => {
    const hero = loader(Hero)
    const card = loader(Card)
    const loaders: BlockLoaders = { hero, card }

    const blocks = await loadBlocks(loaders, [{ id: '1', blockId: 'hero', data: {} }])
    expect(blocks.get('hero')).toBe(Hero)
    expect(blocks.has('card')).toBe(false)
    expect(hero).toHaveBeenCalledOnce()
    expect(card).not.toHaveBeenCalled()
  })

  it('skips ids that already exist in the target map and ids with no loader', async () => {
    const hero = loader(Hero)
    const existing = new Map<string, Component>([['hero', Hero]])

    const blocks = await loadBlocks({ hero }, [
      { id: '1', blockId: 'hero', data: {} },
      { id: '2', blockId: 'retired', data: {} }, // unknown → renderBlocks skips it
    ], existing)

    expect(blocks).toBe(existing) // grows the given map in place
    expect(hero).not.toHaveBeenCalled()
  })

  it('loads nested slot children too', async () => {
    const card = loader(Card)
    const content: ContentBlock[] = [
      { id: '1', blockId: 'columns', data: {}, children: { start: [{ id: '2', blockId: 'card', data: {} }] } },
    ]
    const blocks = await loadBlocks({ card }, content)
    expect(blocks.get('card')).toBe(Card)
  })
})
