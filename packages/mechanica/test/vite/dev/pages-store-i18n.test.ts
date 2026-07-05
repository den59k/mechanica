import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { serializePage } from 'mechanica-shared/page-format'
import type { LocalesConfig } from 'mechanica-shared'
import {
  getPagePath,
  readPage,
  createPage,
  duplicatePage,
  deletePage,
  savePage,
  renamePage,
  movePage,
  listPages,
  pageVersion,
  pageUrlOf,
  createTranslation,
  deleteTranslation,
  translationsOf,
  variantFilesOf,
  PageExistsError,
} from '@/vite/dev/pages-store'

const config: LocalesConfig = { default: 'en', all: ['en', 'ru', 'de'] }

let mechDir: string

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-i18n-'))
  fs.mkdirSync(join(mechDir, 'pages'), { recursive: true })
})
afterEach(() => fs.rmSync(mechDir, { recursive: true, force: true }))

function writePage(relative: string, data: Record<string, unknown> = {}) {
  const file = join(mechDir, 'pages', relative)
  fs.mkdirSync(dirname(file), { recursive: true })
  fs.writeFileSync(file, serializePage({ content: [], data: {}, ...data }))
}
const exists = (relative: string) => fs.existsSync(join(mechDir, 'pages', relative))

describe('getPagePath with a locale', () => {
  it('inserts the @locale suffix before the extension', () => {
    expect(getPagePath(mechDir, '/about', 'ru')).toBe(join(mechDir, 'pages', 'about@ru.page.md'))
    expect(getPagePath(mechDir, '/about')).toBe(join(mechDir, 'pages', 'about.page.md'))
  })

  it('handles a folder index', () => {
    fs.mkdirSync(join(mechDir, 'pages', 'blog'), { recursive: true })
    writePage('blog/index.page.md')
    expect(getPagePath(mechDir, '/blog', 'ru')).toBe(join(mechDir, 'pages', 'blog', 'index@ru.page.md'))
  })
})

describe('createTranslation / translationsOf / deleteTranslation', () => {
  it('seeds a translation from the default-locale content', () => {
    writePage('about.page.md', { name: 'About', content: [{ id: 'a', blockId: 'hero', data: {} }] })
    createTranslation(mechDir, '/about', 'ru')

    expect(exists('about@ru.page.md')).toBe(true)
    const ru = readPage(mechDir, '/about', 'ru')
    expect(ru.content).toHaveLength(1)
    expect(pageVersion(mechDir, '/about', 'ru')).not.toBeNull()
  })

  it('reports which locales a page has, in config order', () => {
    writePage('about.page.md')
    expect(translationsOf(mechDir, '/about', config)).toEqual(['en'])
    createTranslation(mechDir, '/about', 'de')
    createTranslation(mechDir, '/about', 'ru')
    expect(translationsOf(mechDir, '/about', config)).toEqual(['en', 'ru', 'de'])
  })

  it('throws when the translation already exists', () => {
    writePage('about.page.md')
    createTranslation(mechDir, '/about', 'ru')
    expect(() => createTranslation(mechDir, '/about', 'ru')).toThrow(PageExistsError)
  })

  it('deletes only the named translation', () => {
    writePage('about.page.md')
    createTranslation(mechDir, '/about', 'ru')
    createTranslation(mechDir, '/about', 'de')
    expect(deleteTranslation(mechDir, '/about', 'ru')).toBe(true)
    expect(exists('about@ru.page.md')).toBe(false)
    expect(exists('about@de.page.md')).toBe(true)
    expect(exists('about.page.md')).toBe(true)
    expect(deleteTranslation(mechDir, '/about', 'ru')).toBe(false)
  })
})

describe('savePage / pageVersion per locale', () => {
  it('writes to the translation file, leaving the base untouched', () => {
    writePage('about.page.md', { content: [{ id: 'a', blockId: 'x', data: { t: 'en' } }] })
    createTranslation(mechDir, '/about', 'ru')
    savePage(mechDir, '/about', { content: [{ id: 'a', blockId: 'x', data: { t: 'ru' } }] }, 'ru')

    expect(readPage(mechDir, '/about').content?.[0]?.data).toEqual({ t: 'en' })
    expect(readPage(mechDir, '/about', 'ru').content?.[0]?.data).toEqual({ t: 'ru' })
  })

  it('creates the translation file on first save (fallback edit materializes it)', () => {
    writePage('about.page.md')
    expect(pageVersion(mechDir, '/about', 'ru')).toBeNull()
    savePage(mechDir, '/about', { content: [{ id: 'a', blockId: 'x', data: {} }] }, 'ru')
    expect(exists('about@ru.page.md')).toBe(true)
  })
})

describe('variantFilesOf', () => {
  it('lists every translation of a page', () => {
    writePage('about.page.md')
    createTranslation(mechDir, '/about', 'ru')
    createTranslation(mechDir, '/about', 'de')
    // A different page's translation must not leak in.
    writePage('contact.page.md')
    createTranslation(mechDir, '/contact', 'ru')

    const locales = variantFilesOf(mechDir, '/about')
      .map((v) => v.locale)
      .sort()
    expect(locales).toEqual(['de', 'ru'])
  })
})

describe('listPages groups translations', () => {
  it('never lists a translation as its own row; reports coverage', () => {
    writePage('about.page.md', { name: 'About' })
    createTranslation(mechDir, '/about', 'ru')
    writePage('contact.page.md', { name: 'Contact' })

    const items = listPages(mechDir, { locales: config })
    expect(items.map((p) => p.path).sort()).toEqual(['/about', '/contact'])
    expect(items.find((p) => p.path === '/about')?.locales).toEqual(['en', 'ru'])
    expect(items.find((p) => p.path === '/contact')?.locales).toEqual(['en'])
  })

  it('omits the locales field when i18n is off', () => {
    writePage('about.page.md')
    const items = listPages(mechDir)
    expect(items[0]?.locales).toBeUndefined()
  })
})

describe('cascading page operations move translations with the base', () => {
  it('deletePage removes the base and every translation', () => {
    writePage('about.page.md')
    createTranslation(mechDir, '/about', 'ru')
    createTranslation(mechDir, '/about', 'de')
    expect(deletePage(mechDir, '/about')).toBe(true)
    expect(exists('about.page.md')).toBe(false)
    expect(exists('about@ru.page.md')).toBe(false)
    expect(exists('about@de.page.md')).toBe(false)
  })

  it('movePage carries translations to the new path', () => {
    writePage('about.page.md', { name: 'About' })
    createTranslation(mechDir, '/about', 'ru')
    movePage(mechDir, '/about', '/company/about')

    expect(exists('about.page.md')).toBe(false)
    expect(exists('about@ru.page.md')).toBe(false)
    expect(exists('company/about.page.md')).toBe(true)
    expect(exists('company/about@ru.page.md')).toBe(true)
    expect(readPage(mechDir, '/company/about', 'ru').path).toBe('/company/about')
  })

  it('duplicatePage copies translations too', () => {
    writePage('about.page.md', { name: 'About' })
    createTranslation(mechDir, '/about', 'ru')
    duplicatePage(mechDir, '/about', { path: '/about-copy', name: 'About copy' })

    expect(exists('about-copy.page.md')).toBe(true)
    expect(exists('about-copy@ru.page.md')).toBe(true)
  })

  it('renamePage relabels the base and every translation', () => {
    writePage('about.page.md', { name: 'About' })
    createTranslation(mechDir, '/about', 'ru')
    renamePage(mechDir, '/about', 'Über uns')
    expect(readPage(mechDir, '/about').name).toBe('Über uns')
    expect(readPage(mechDir, '/about', 'ru').name).toBe('Über uns')
  })
})

describe('listPages locale-scoped listing (locale-aware queries)', () => {
  it('lists only translated pages and embeds the translation data/name', () => {
    writePage('posts/a.page.md', { name: 'A', data: { meta: { title: 'A en' } } })
    createTranslation(mechDir, '/posts/a', 'ru')
    savePage(mechDir, '/posts/a', { data: { meta: { title: 'A ru' } } }, 'ru')
    writePage('posts/b.page.md', { name: 'B', data: { meta: { title: 'B en' } } }) // en only

    // Default listing: both pages, English data.
    const en = listPages(mechDir, { data: [{ id: 'meta' }] })
    expect(en.map((p) => p.path).sort()).toEqual(['/posts/a', '/posts/b'])
    expect(en.find((p) => p.path === '/posts/a')?.meta).toEqual({ title: 'A en' })

    // ru listing: only the translated page, with its ru data.
    const ru = listPages(mechDir, { data: [{ id: 'meta' }], locale: 'ru' })
    expect(ru.map((p) => p.path)).toEqual(['/posts/a'])
    expect(ru.find((p) => p.path === '/posts/a')?.meta).toEqual({ title: 'A ru' })
  })
})

describe('pageUrlOf strips the @locale suffix', () => {
  it('maps a translation file to its logical URL', () => {
    expect(pageUrlOf(mechDir, join(mechDir, 'pages', 'about@ru.page.md'))).toBe('/about')
    expect(pageUrlOf(mechDir, join(mechDir, 'pages', 'blog', 'index@de.page.md'))).toBe('/blog')
    expect(pageUrlOf(mechDir, join(mechDir, 'pages', 'about.page.md'))).toBe('/about')
  })
})

describe('createPage stays locale-agnostic', () => {
  it('creates a base page normally (locale reservation is enforced in the middleware)', () => {
    createPage(mechDir, { path: '/about', name: 'About' })
    expect(exists('about.page.md')).toBe(true)
  })
})
