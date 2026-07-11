import { describe, it, expect } from 'vitest'
import {
  toBlockMeta,
  composedBlockMeta,
  blockAvailableIn,
  blockAvailableForLayout,
  createContentBlock,
  compareBlocks,
} from '@/editor/lib/block-meta'
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

describe('blockAvailableForLayout', () => {
  const scoped: Block = { id: 'doc-nav', name: 'Doc nav', layouts: ['docs'] }

  it('offers unrestricted blocks on every layout', () => {
    expect(blockAvailableForLayout({ id: 'b', name: 'B' }, 'docs')).toBe(true)
    expect(blockAvailableForLayout({ id: 'b', name: 'B', layouts: [] }, null)).toBe(true)
  })

  it('restricts layout-scoped blocks to their layouts', () => {
    expect(blockAvailableForLayout(scoped, 'docs')).toBe(true)
    expect(blockAvailableForLayout(scoped, 'site')).toBe(false)
  })

  it('ignores the filter on a site without layouts (nothing to match against)', () => {
    expect(blockAvailableForLayout(scoped, null)).toBe(true)
  })
})

describe('toBlockMeta', () => {
  it('extracts standalone and layouts from the compiled schema', () => {
    const meta = toBlockMeta({
      blockId: 'feedback',
      __name: 'Feedback',
      blockSchema: { name: 'Feedback form', standalone: true, layouts: ['site'], props: {} },
    })
    expect(meta.standalone).toBe(true)
    expect(meta.layouts).toEqual(['site'])
  })

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

describe('composedBlockMeta', () => {
  it('carries the hidden flag so one-off page designs stay out of the palette', () => {
    const meta = composedBlockMeta({ id: 'feedback-page', name: 'Feedback page', hidden: true, template: [] })
    expect(meta.hidden).toBe(true)
    expect(meta.composed).toBe(true)
    expect(composedBlockMeta({ id: 'card', name: 'Card', template: [] }).hidden).toBeUndefined()
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
