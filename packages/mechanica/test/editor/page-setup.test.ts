import { describe, it, expect } from 'vitest'
import type { Block, ContentBlock } from 'mechanica-shared'
import { standalonePageBlockId, applyPageBlock } from '@/editor/lib/page-setup'

const hero: Block = { id: 'hero', name: 'Hero' }
const notFound: Block = {
  id: 'not-found',
  name: 'Not found page',
  standalone: true,
  props: {
    type: 'object',
    required: ['code'],
    properties: { code: { type: 'string', default: '404' } },
  },
}
const feedback: Block = { id: 'feedback', name: 'Feedback form', standalone: true }
const blocksById = new Map<string, Block>([['hero', hero], ['not-found', notFound], ['feedback', feedback]])

const placed = (blockId: string): ContentBlock => ({ id: `id-${blockId}`, blockId, data: {} })

describe('standalonePageBlockId', () => {
  it('reports the block only when it is the whole page', () => {
    expect(standalonePageBlockId([placed('not-found')], blocksById)).toBe('not-found')
    expect(standalonePageBlockId([], blocksById)).toBeUndefined()
    expect(standalonePageBlockId([placed('hero')], blocksById)).toBeUndefined()
    expect(standalonePageBlockId([placed('not-found'), placed('hero')], blocksById)).toBeUndefined()
  })
})

describe('applyPageBlock', () => {
  it('fills an empty page silently, with schema defaults', () => {
    const content: ContentBlock[] = []
    const block = applyPageBlock(content, notFound, blocksById, () => {
      throw new Error('should not confirm')
    })
    expect(block?.blockId).toBe('not-found')
    expect(content).toHaveLength(1)
    expect(content[0]!.data.code).toBe('404')
  })

  it('swaps one standalone block for another silently', () => {
    const content = [placed('not-found')]
    applyPageBlock(content, feedback, blocksById, () => {
      throw new Error('should not confirm')
    })
    expect(content.map((b) => b.blockId)).toEqual(['feedback'])
  })

  it('is a no-op when the block is already the page', () => {
    const content = [placed('not-found')]
    const before = content[0]
    expect(applyPageBlock(content, notFound, blocksById, () => true)).toBeNull()
    expect(content[0]).toBe(before) // same instance — data untouched
  })

  it('asks before replacing custom content and respects a decline', () => {
    const content = [placed('hero'), placed('hero')]
    const messages: string[] = []
    const declined = applyPageBlock(content, notFound, blocksById, (message) => {
      messages.push(message)
      return false
    })
    expect(declined).toBeNull()
    expect(content).toHaveLength(2)
    expect(messages[0]).toContain('its 2 blocks')

    const accepted = applyPageBlock(content, notFound, blocksById, () => true)
    expect(accepted?.blockId).toBe('not-found')
    expect(content).toHaveLength(1)
  })
})
