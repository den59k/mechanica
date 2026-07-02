import { describe, it, expect } from 'vitest'
import { filterByPrefix, filterBlockTargets, orphanThumbs } from '@/cli/thumbs'

describe('filterByPrefix', () => {
  const pages = [{ path: '/' }, { path: '/docs' }, { path: '/docs/api' }, { path: '/docs-old' }, { path: '/about' }]

  it('returns everything without a prefix (or the root prefix)', () => {
    expect(filterByPrefix(pages)).toEqual(pages)
    expect(filterByPrefix(pages, '/')).toEqual(pages)
  })

  it('matches the prefix page and its children, not lookalike siblings', () => {
    expect(filterByPrefix(pages, '/docs').map((p) => p.path)).toEqual(['/docs', '/docs/api'])
  })
})

describe('filterBlockTargets', () => {
  const blocks = [{ id: 'hero' }, { id: 'hero-split' }, { id: 'card' }, { id: 'internal', hidden: true }]

  it('always drops hidden blocks (they are not in the palette)', () => {
    expect(filterBlockTargets(blocks).map((b) => b.id)).toEqual(['hero', 'hero-split', 'card'])
  })

  it('narrows to an exact id or id prefix', () => {
    expect(filterBlockTargets(blocks, 'hero').map((b) => b.id)).toEqual(['hero', 'hero-split'])
    expect(filterBlockTargets(blocks, 'card').map((b) => b.id)).toEqual(['card'])
    expect(filterBlockTargets(blocks, 'nope')).toEqual([])
  })
})

describe('orphanThumbs', () => {
  it('flags pngs that no longer correspond to a page', () => {
    const files = ['index.png', 'docs.png', 'deleted-page.png', 'notes.txt']
    const slugs = new Set(['index', 'docs'])
    expect(orphanThumbs(files, slugs)).toEqual(['deleted-page.png'])
  })
})
