import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { type Block, type LocalesConfig } from 'mechanica-shared'
import { serializePage } from 'mechanica-shared/page-format'
import { setPageBlocks, createTranslation, savePage } from '@/vite/dev/pages-store'
import { mergeSiteData, mergeLocaleSiteData } from '@/vite/dev/data-store'
import { buildPageState } from '@/vite/dev/page-state'

let mechDir: string

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
  fs.mkdirSync(join(mechDir, 'pages'), { recursive: true })
})
afterEach(() => {
  setPageBlocks(undefined)
  fs.rmSync(mechDir, { recursive: true, force: true })
})

function writePage(relative: string, data: Record<string, unknown>) {
  const file = join(mechDir, 'pages', relative)
  fs.mkdirSync(dirname(file), { recursive: true })
  fs.writeFileSync(file, serializePage({ content: [], data: {}, ...data }))
}

const heroMeta: Block = {
  id: 'hero',
  name: 'Hero',
  // Shaped like toBlockMeta's unfolded output (all non-optional keys required).
  props: {
    type: 'object',
    required: ['title', 'subtitle'],
    properties: {
      title: { type: 'string', default: 'Start here' },
      subtitle: { type: 'string' },
    },
  },
}

describe('buildPageState block-prop defaults', () => {
  it('bakes schema defaults into the dev state, like export does', () => {
    writePage('home.page.md', {
      content: [{ id: 'h', blockId: 'hero', data: { subtitle: 'kept' } }],
    })
    setPageBlocks([heroMeta])

    const state = buildPageState(mechDir, '/home')
    expect(state.content[0]!.data).toEqual({ title: 'Start here', subtitle: 'kept' })

    // The read itself does not rewrite the file.
    const raw = fs.readFileSync(join(mechDir, 'pages', 'home.page.md'), 'utf-8')
    expect(raw).not.toContain('Start here')
  })

  it('serves untouched data when block metadata is not configured yet', () => {
    writePage('home.page.md', {
      content: [{ id: 'h', blockId: 'hero', data: {} }],
    })
    const state = buildPageState(mechDir, '/home')
    expect(state.content[0]!.data).toEqual({})
  })
})

describe('buildPageState locale routing', () => {
  const config: LocalesConfig = { default: 'en', all: ['en', 'ru'] }

  it('serves the default locale for an unprefixed URL', () => {
    writePage('about.page.md', { name: 'About' })
    createTranslation(mechDir, '/about', 'ru')
    const state = buildPageState(mechDir, '/about', config)
    expect(state.page.path).toBe('/about')
    expect(state.page.locale).toBe('en')
    expect(state.page.locales).toEqual(['en', 'ru'])
    expect(state.page.localeFallback).toBeUndefined()
    expect(state.locales).toEqual(config)
  })

  it('serves the translation for a locale-prefixed URL, with its own version', () => {
    writePage('about.page.md', { content: [{ id: 'a', blockId: 'x', data: { t: 'en' } }] })
    createTranslation(mechDir, '/about', 'ru')
    savePage(mechDir, '/about', { content: [{ id: 'a', blockId: 'x', data: { t: 'ru' } }] }, 'ru')

    const state = buildPageState(mechDir, '/ru/about', config)
    expect(state.page.path).toBe('/about') // logical
    expect(state.page.locale).toBe('ru')
    expect(state.content[0]!.data).toEqual({ t: 'ru' })
    expect(state.version).not.toBeNull()
  })

  it('inherits shared fields from the base; a later base edit propagates', () => {
    writePage('home.page.md', {
      content: [
        { id: 'hero', blockId: 'banner', data: { image: { src: '/car.png', width: 1024 }, heading: 'Hello' } },
      ],
    })
    createTranslation(mechDir, '/home', 'ru')
    // A translation that only translates the heading (the image is left shared).
    savePage(
      mechDir,
      '/home',
      {
        content: [
          { id: 'hero', blockId: 'banner', data: { image: { src: '/car.png', width: 1024 }, heading: 'Привет' } },
        ],
      },
      'ru',
    )
    const ru = buildPageState(mechDir, '/ru/home', config)
    expect(ru.content[0]!.data).toEqual({ image: { src: '/car.png', width: 1024 }, heading: 'Привет' })

    // Changing the image in the default locale flows into the translation with
    // no re-translation — the whole point of the overlay model.
    savePage(mechDir, '/home', {
      content: [
        { id: 'hero', blockId: 'banner', data: { image: { src: '/tesla.png', width: 2048 }, heading: 'Hello' } },
      ],
    })
    const ru2 = buildPageState(mechDir, '/ru/home', config)
    expect(ru2.content[0]!.data).toEqual({ image: { src: '/tesla.png', width: 2048 }, heading: 'Привет' })
  })

  it('falls back to default content (flagged) when a translation is missing', () => {
    writePage('about.page.md', { content: [{ id: 'a', blockId: 'x', data: { t: 'en' } }] })
    const state = buildPageState(mechDir, '/ru/about', config)
    expect(state.page.locale).toBe('ru')
    expect(state.page.localeFallback).toBe(true)
    expect(state.content[0]!.data).toEqual({ t: 'en' })
    // No translation file yet → no version, so the first save creates it.
    expect(state.version).toBeNull()
  })

  it('composes a locale prefix with a pagination variant', () => {
    writePage('blog/index.page.md', { name: 'Blog' })
    createTranslation(mechDir, '/blog', 'ru')
    const state = buildPageState(mechDir, '/ru/blog/2', config)
    expect(state.page.path).toBe('/blog')
    expect(state.page.locale).toBe('ru')
    expect(state.page.pagination).toEqual({ page: 2 })
  })

  it('adds no locale metadata when i18n is off', () => {
    writePage('about.page.md', {})
    const state = buildPageState(mechDir, '/about')
    expect(state.page.locale).toBeUndefined()
    expect(state.locales).toBeUndefined()
  })

  it('resolves localized site data per locale (with fallback)', () => {
    writePage('about.page.md', { name: 'About' })
    createTranslation(mechDir, '/about', 'ru')
    mergeSiteData(mechDir, { nav: { home: 'Home' }, footer: { note: 'shared' } })
    mergeLocaleSiteData(mechDir, 'ru', { nav: { home: 'Главная' } })

    const en = buildPageState(mechDir, '/about', config)
    expect(en.siteData).toEqual({ nav: { home: 'Home' }, footer: { note: 'shared' } })

    const ru = buildPageState(mechDir, '/ru/about', config)
    expect(ru.siteData).toEqual({ nav: { home: 'Главная' }, footer: { note: 'shared' } })
    expect(ru.data).toMatchObject({ nav: { home: 'Главная' }, footer: { note: 'shared' } })
  })
})
