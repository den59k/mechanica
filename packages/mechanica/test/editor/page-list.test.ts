import { describe, it, expect } from 'vitest'
import { filterPages, groupPagesByFolder, pageThumbUrl, pathFromName } from '@/editor/lib/page-list'

const pages = [
  { path: '/', name: 'Home', folderPath: null },
  { path: '/about', name: 'About', folderPath: null },
  { path: '/docs/intro', name: 'Intro', folderPath: 'docs' },
  { path: '/docs/api', name: 'API Reference', folderPath: 'docs' },
  { path: '/blog/hello', name: 'Hello', folderPath: 'blog' },
]

describe('pageThumbUrl', () => {
  it('mirrors the CLI slug: root → index, slashes → dashes', () => {
    expect(pageThumbUrl('/')).toBe('/@mechanica/thumbs/index.png')
    expect(pageThumbUrl('/docs/api')).toBe('/@mechanica/thumbs/docs-api.png')
  })
})

describe('pathFromName', () => {
  it('slugs the name, folding case, spaces, and punctuation', () => {
    expect(pathFromName('Getting Started')).toBe('/getting-started')
    expect(pathFromName('  Hello,  World! ')).toBe('/hello-world')
    expect(pathFromName('Café Menu')).toBe('/cafe-menu')
  })
  it('prefixes the folder and survives empty input', () => {
    expect(pathFromName('API Reference', 'docs')).toBe('/docs/api-reference')
    expect(pathFromName('', 'docs')).toBe('/docs')
    expect(pathFromName('')).toBe('/')
  })
})

describe('filterPages', () => {
  it('matches name or path, case-insensitively', () => {
    expect(filterPages(pages, 'intro').map((p) => p.path)).toEqual(['/docs/intro'])
    expect(filterPages(pages, '/DOCS').map((p) => p.path)).toEqual(['/docs/intro', '/docs/api'])
    expect(filterPages(pages, 'reference').map((p) => p.name)).toEqual(['API Reference'])
  })
  it('returns everything for a blank query', () => {
    expect(filterPages(pages, '   ')).toHaveLength(5)
  })
})

describe('groupPagesByFolder', () => {
  it('puts root pages first, then folders alphabetically, preserving order', () => {
    const groups = groupPagesByFolder(pages)
    expect(groups.map((g) => g.folder)).toEqual([null, 'blog', 'docs'])
    expect(groups[0]!.pages.map((p) => p.path)).toEqual(['/', '/about'])
    expect(groups[2]!.pages.map((p) => p.name)).toEqual(['Intro', 'API Reference'])
  })
})
