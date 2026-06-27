import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { serializePage } from '@mechanica/shared'
import {
  getPagePath,
  readPage,
  createPage,
  duplicatePage,
  deletePage,
  savePage,
  renamePage,
  movePage,
  listFolders,
  listPages,
  PageExistsError,
} from '@/vite/dev/pages-store'

let mechDir: string

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
  fs.mkdirSync(join(mechDir, 'pages'), { recursive: true })
})
afterEach(() => fs.rmSync(mechDir, { recursive: true, force: true }))

function writePage(relative: string, data: Record<string, unknown>) {
  const file = join(mechDir, 'pages', relative)
  fs.mkdirSync(dirname(file), { recursive: true })
  fs.writeFileSync(file, serializePage({ content: [], data: {}, ...data }))
}

describe('getPagePath', () => {
  it('maps the root path to index.page.md', () => {
    expect(getPagePath(mechDir, '/')).toBe(join(mechDir, 'pages', 'index.page.md'))
  })
  it('maps a plain path to <name>.page.md', () => {
    expect(getPagePath(mechDir, '/about')).toBe(join(mechDir, 'pages', 'about.page.md'))
  })
  it('maps a directory path to its index.page.md', () => {
    writePage('docs/index.page.md', { content: [], data: {} })
    expect(getPagePath(mechDir, '/docs')).toBe(join(mechDir, 'pages', 'docs', 'index.page.md'))
  })
})

describe('createPage', () => {
  it('creates a page and rejects duplicates', () => {
    const page = createPage(mechDir, { path: '/about', name: 'About' })
    expect(page.name).toBe('About')
    expect(readPage(mechDir, '/about').name).toBe('About')
    expect(() => createPage(mechDir, { path: '/about', name: 'About' })).toThrow(PageExistsError)
  })
})

describe('duplicatePage', () => {
  it('copies content and data to a new path', () => {
    createPage(mechDir, { path: '/a', name: 'A' })
    savePage(mechDir, '/a', { content: [{ id: '1', blockId: 'x', data: {} }], data: { k: 1 } })
    const copy = duplicatePage(mechDir, '/a', { path: '/b', name: 'B' })
    expect(copy.name).toBe('B')
    const page = readPage(mechDir, '/b')
    expect(page.content).toHaveLength(1)
    expect(page.data).toEqual({ k: 1 })
  })

  it('rejects duplicating onto an existing path', () => {
    createPage(mechDir, { path: '/a', name: 'A' })
    createPage(mechDir, { path: '/b', name: 'B' })
    expect(() => duplicatePage(mechDir, '/a', { path: '/b', name: 'B2' })).toThrow(PageExistsError)
  })
})

describe('deletePage', () => {
  it('removes a page and reports whether it existed', () => {
    createPage(mechDir, { path: '/gone', name: 'Gone' })
    expect(deletePage(mechDir, '/gone')).toBe(true)
    expect(fs.existsSync(getPagePath(mechDir, '/gone'))).toBe(false)
    expect(deletePage(mechDir, '/gone')).toBe(false)
  })

  it('cleans up a folder directory once its last page is gone', () => {
    createPage(mechDir, { path: '/post', name: 'Post', folderId: 'blog' })
    deletePage(mechDir, '/blog/post')
    expect(fs.existsSync(join(mechDir, 'pages', 'blog'))).toBe(false)
  })
})

describe('movePage', () => {
  it('moves a page to a new path, preserving content and data', () => {
    createPage(mechDir, { path: '/old', name: 'Old' })
    savePage(mechDir, '/old', { content: [{ id: '1', blockId: 'x', data: {} }], data: { k: 1 } })
    const moved = movePage(mechDir, '/old', '/new')
    expect(moved.path).toBe('/new')
    expect(fs.existsSync(getPagePath(mechDir, '/old'))).toBe(false)
    const page = readPage(mechDir, '/new')
    expect(page.content).toHaveLength(1)
    expect(page.data).toEqual({ k: 1 })
    expect(page.path).toBe('/new')
  })

  it('rejects moving onto an existing page', () => {
    createPage(mechDir, { path: '/a', name: 'A' })
    createPage(mechDir, { path: '/b', name: 'B' })
    expect(() => movePage(mechDir, '/a', '/b')).toThrow(PageExistsError)
  })

  it('cleans up an emptied folder when moving a page out of it', () => {
    createPage(mechDir, { path: '/post', name: 'Post', folderId: 'blog' })
    movePage(mechDir, '/blog/post', '/post')
    expect(fs.existsSync(join(mechDir, 'pages', 'blog'))).toBe(false)
    expect(readPage(mechDir, '/post').name).toBe('Post')
  })
})

describe('savePage / renamePage', () => {
  it('merges content and data', () => {
    createPage(mechDir, { path: '/p', name: 'P' })
    savePage(mechDir, '/p', { content: [{ id: '1', blockId: 'x', data: {} }], data: { a: 1 } })
    const page = readPage(mechDir, '/p')
    expect(page.content).toHaveLength(1)
    expect(page.data).toEqual({ a: 1 })
    expect(page.name).toBe('P') // preserved
  })
  it('renames a page without touching its content', () => {
    createPage(mechDir, { path: '/p', name: 'P' })
    savePage(mechDir, '/p', { content: [{ id: '1', blockId: 'x', data: {} }], data: {} })
    renamePage(mechDir, '/p', 'Renamed')
    const page = readPage(mechDir, '/p')
    expect(page.name).toBe('Renamed')
    expect(page.content).toHaveLength(1) // preserved
  })
})

describe('listFolders', () => {
  it('lists top-level directories', () => {
    writePage('docs/index.page.md', { content: [], data: {} })
    writePage('blog/index.page.md', { content: [], data: {} })
    expect(listFolders(mechDir).map((f) => f.id).sort()).toEqual(['blog', 'docs'])
  })
})

describe('listPages', () => {
  it('orders root pages by order then orderAfter', () => {
    writePage('index.page.md', { content: [], data: {}, name: 'Home', order: 0 })
    writePage('b.page.md', { content: [], data: {}, order: 1 })
    writePage('a.page.md', { content: [], data: {}, order: 1, orderAfter: '/b' })
    expect(listPages(mechDir).map((p) => p.path)).toEqual(['/', '/b', '/a'])
  })

  it('groups folder pages after root pages', () => {
    writePage('index.page.md', { content: [], data: {} })
    writePage('docs/index.page.md', { content: [], data: {} })
    writePage('docs/guide.page.md', { content: [], data: {} })
    const items = listPages(mechDir)
    expect(items[0]!.path).toBe('/')
    expect(items.slice(1).every((i) => i.folderPath === 'docs')).toBe(true)
  })

  it('embeds requested data entries', () => {
    writePage('index.page.md', { content: [], data: { header: { title: 'Hi' } } })
    const [page] = listPages(mechDir, { data: [{ id: 'header' }] })
    expect(page!.header).toEqual({ title: 'Hi' })
  })
})
