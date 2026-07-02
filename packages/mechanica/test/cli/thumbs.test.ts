import { describe, it, expect } from 'vitest'
import { filterByPrefix, orphanThumbs } from '@/cli/thumbs'

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

describe('orphanThumbs', () => {
  it('flags pngs that no longer correspond to a page', () => {
    const files = ['index.png', 'docs.png', 'deleted-page.png', 'notes.txt']
    const slugs = new Set(['index', 'docs'])
    expect(orphanThumbs(files, slugs)).toEqual(['deleted-page.png'])
  })
})
