import { describe, it, expect } from 'vitest'
import { validateLinks, collectInternalLinks, normalizeInternalUrl } from '@/validate-links'
import type { Block } from '@/types'

const linkBlock: Block = {
  id: 'cta',
  name: 'CTA',
  props: {
    type: 'object',
    properties: {
      link: { type: 'object', format: 'smartLink', properties: { url: { type: 'string' } } },
      title: { type: 'string' },
    },
  },
}
const blocksMap = new Map([[linkBlock.id, linkBlock]])

const page = (path: string, url?: string, extra: Record<string, unknown> = {}) => ({
  path,
  content: url ? [{ id: '1', blockId: 'cta', data: { link: { url, ...extra }, title: 'Go' } }] : [],
})

describe('normalizeInternalUrl', () => {
  it('drops query, hash and trailing slashes', () => {
    expect(normalizeInternalUrl('/docs/')).toBe('/docs')
    expect(normalizeInternalUrl('/docs?tab=1')).toBe('/docs')
    expect(normalizeInternalUrl('/docs#install')).toBe('/docs')
    expect(normalizeInternalUrl('/')).toBe('/')
  })
})

describe('collectInternalLinks', () => {
  it('collects site-relative smartLink urls', () => {
    expect(collectInternalLinks(page('/', '/about').content, blocksMap)).toEqual(['/about'])
  })

  it('ignores external and absolute urls', () => {
    expect(collectInternalLinks(page('/', 'https://x.com').content, blocksMap)).toEqual([])
    expect(collectInternalLinks(page('/', '/about', { external: true }).content, blocksMap)).toEqual([])
  })

  it('ignores blocks with unknown ids', () => {
    const content = [{ id: '1', blockId: 'gone', data: { link: { url: '/x' } } }]
    expect(collectInternalLinks(content, blocksMap)).toEqual([])
  })
})

describe('validateLinks', () => {
  it('reports links to pages that do not exist', () => {
    const pages = [page('/', '/missing'), page('/about', '/'), page('/docs')]
    expect(validateLinks(pages, blocksMap)).toEqual([{ page: '/', url: '/missing' }])
  })

  it('treats trailing slashes and anchors as the same page', () => {
    const pages = [page('/', '/docs/#install'), page('/docs')]
    expect(validateLinks(pages, blocksMap)).toEqual([])
  })
})
