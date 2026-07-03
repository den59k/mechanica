import { describe, it, expect } from 'vitest'
import { toBlockMeta, blockAvailableIn, createContentBlock, compareBlocks } from '@/editor/lib/block-meta'
import type { Block } from 'mechanica-shared'

const block = (folders?: string[]): Block => ({ id: 'b', name: 'B', folders })

describe('blockAvailableIn', () => {
  it('offers unrestricted blocks everywhere', () => {
    expect(blockAvailableIn(block(), null)).toBe(true)
    expect(blockAvailableIn(block(), 'docs')).toBe(true)
    expect(blockAvailableIn(block([]), null)).toBe(true)
  })

  it('restricts folder-scoped blocks to their folders', () => {
    const docsOnly = block(['docs'])
    expect(blockAvailableIn(docsOnly, 'docs')).toBe(true)
    expect(blockAvailableIn(docsOnly, 'blog')).toBe(false)
    expect(blockAvailableIn(docsOnly, null)).toBe(false)
  })

  it('matches nested folders by prefix, not substring', () => {
    const docsOnly = block(['docs'])
    expect(blockAvailableIn(docsOnly, 'docs/guides')).toBe(true)
    expect(blockAvailableIn(docsOnly, 'docs-v2')).toBe(false)
  })

  it('accepts leading/trailing slashes in either side', () => {
    expect(blockAvailableIn(block(['/docs/']), 'docs')).toBe(true)
    expect(blockAvailableIn(block(['docs']), '/docs')).toBe(true)
  })

  it('supports several folders', () => {
    const scoped = block(['docs', 'blog'])
    expect(blockAvailableIn(scoped, 'blog')).toBe(true)
    expect(blockAvailableIn(scoped, 'shop')).toBe(false)
  })
})

describe('toBlockMeta', () => {
  it('extracts folders from the compiled schema', () => {
    const meta = toBlockMeta({
      blockId: 'doc-section',
      __name: 'DocSection',
      blockSchema: { name: 'Doc section', folders: ['docs'], props: {} },
    })
    expect(meta.folders).toEqual(['docs'])
  })

  it('extracts version and migrate', () => {
    const migrate = (data: Record<string, unknown>) => data
    const meta = toBlockMeta({
      blockId: 'hero',
      blockSchema: { name: 'Hero', version: 3, migrate, props: {} },
    })
    expect(meta.version).toBe(3)
    expect(meta.migrate).toBe(migrate)
  })
})

describe('compareBlocks', () => {
  const make = (name: string, order?: number): Block => ({ id: name.toLowerCase(), name, order })

  it('sorts by explicit order first, then alphabetically', () => {
    const sorted = [make('Zeta'), make('Card', 2), make('Alpha'), make('Hero', 1)].sort(compareBlocks)
    expect(sorted.map((block) => block.name)).toEqual(['Hero', 'Card', 'Alpha', 'Zeta'])
  })

  it('breaks order ties by name', () => {
    const sorted = [make('B', 1), make('A', 1)].sort(compareBlocks)
    expect(sorted.map((block) => block.name)).toEqual(['A', 'B'])
  })
})

describe('createContentBlock', () => {
  it('stamps the schema version on versioned blocks only', () => {
    expect(createContentBlock({ id: 'a', name: 'A', version: 2 }).v).toBe(2)
    expect(createContentBlock({ id: 'b', name: 'B' }).v).toBeUndefined()
  })
})
