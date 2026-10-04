import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import {
  readSiteData,
  mergeSiteData,
  folderOf,
  readFolderData,
  mergeFolderData,
  mergeLocaleSiteData,
  mergeLocaleFolderData,
  readSiteLocaleOverride,
} from '@/server/data-store'

let mechDir: string

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
  fs.mkdirSync(join(mechDir, 'pages'), { recursive: true })
})
afterEach(() => fs.rmSync(mechDir, { recursive: true, force: true }))

function writePage(relative: string, data: unknown = { content: [], data: {} }) {
  const file = join(mechDir, 'pages', relative)
  fs.mkdirSync(dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data))
}

describe('folderOf', () => {
  it('returns null for root-level pages', () => {
    expect(folderOf(mechDir, '/')).toBeNull()
    expect(folderOf(mechDir, '/about')).toBeNull()
  })

  it('returns the containing folder for nested pages and folder indexes', () => {
    writePage('blog/post.json')
    writePage('blog/index.json')
    expect(folderOf(mechDir, '/blog/post')).toBe('blog')
    expect(folderOf(mechDir, '/blog')).toBe('blog')
  })
})

describe('folder data file', () => {
  it('returns an empty object for the root or an unknown folder', () => {
    expect(readFolderData(mechDir, null)).toEqual({})
    expect(readFolderData(mechDir, 'blog')).toEqual({})
  })

  it('merges per-folder without leaking across folders, and ignores the root', () => {
    mergeFolderData(mechDir, 'blog', { nav: { items: ['a'] } })
    mergeFolderData(mechDir, 'shop', { nav: { items: ['b'] } })
    mergeFolderData(mechDir, null, { nav: { items: ['ignored'] } })
    expect(readFolderData(mechDir, 'blog')).toEqual({ nav: { items: ['a'] } })
    expect(readFolderData(mechDir, 'shop')).toEqual({ nav: { items: ['b'] } })
  })
})

describe('site data file', () => {
  it('returns an empty object when no file exists', () => {
    expect(readSiteData(mechDir)).toEqual({})
  })

  it('merges new entries without dropping existing ones', () => {
    mergeSiteData(mechDir, { header: { logo: 'a' } })
    mergeSiteData(mechDir, { footer: { year: 2026 } })
    expect(readSiteData(mechDir)).toEqual({ header: { logo: 'a' }, footer: { year: 2026 } })
  })

  it('overwrites an existing entry and is a no-op for an empty patch', () => {
    mergeSiteData(mechDir, { header: { logo: 'old' } })
    mergeSiteData(mechDir, {})
    mergeSiteData(mechDir, { header: { logo: 'new' } })
    expect(readSiteData(mechDir)).toEqual({ header: { logo: 'new' } })
  })

  it('tolerates a corrupt file', () => {
    fs.writeFileSync(join(mechDir, 'data.json'), '{ not json')
    expect(readSiteData(mechDir)).toEqual({})
  })
})

describe('localized site data (per-locale overrides)', () => {
  it('merges a locale override over the base, falling back per entry', () => {
    mergeSiteData(mechDir, { nav: { home: 'Home' }, footer: { note: 'shared' } })
    mergeLocaleSiteData(mechDir, 'ru', { nav: { home: 'Главная' } })

    // Default locale reads the base only.
    expect(readSiteData(mechDir)).toEqual({ nav: { home: 'Home' }, footer: { note: 'shared' } })
    // ru overrides nav, falls back to base for footer.
    expect(readSiteData(mechDir, 'ru')).toEqual({ nav: { home: 'Главная' }, footer: { note: 'shared' } })
    // The override file holds only the differing entry.
    expect(readSiteLocaleOverride(mechDir, 'ru')).toEqual({ nav: { home: 'Главная' } })
  })

  it('drops an override equal to the default, and removes the file when empty', () => {
    mergeSiteData(mechDir, { nav: { home: 'Home' } })
    mergeLocaleSiteData(mechDir, 'ru', { nav: { home: 'Главная' } })
    expect(fs.existsSync(join(mechDir, 'data.ru.json'))).toBe(true)

    // Setting it back to the default value removes the override entirely.
    mergeLocaleSiteData(mechDir, 'ru', { nav: { home: 'Home' } })
    expect(readSiteLocaleOverride(mechDir, 'ru')).toEqual({})
    expect(fs.existsSync(join(mechDir, 'data.ru.json'))).toBe(false)
    expect(readSiteData(mechDir, 'ru')).toEqual({ nav: { home: 'Home' } })
  })
})

describe('localized folder data (per-locale overrides)', () => {
  it('merges per-folder locale overrides over the base folder data', () => {
    mergeFolderData(mechDir, 'blog', { label: 'Blog', tag: 'shared' })
    mergeLocaleFolderData(mechDir, 'ru', 'blog', { label: 'Блог' })

    expect(readFolderData(mechDir, 'blog')).toEqual({ label: 'Blog', tag: 'shared' })
    expect(readFolderData(mechDir, 'blog', 'ru')).toEqual({ label: 'Блог', tag: 'shared' })
    // A different folder is untouched, and the root is ignored.
    expect(readFolderData(mechDir, 'shop', 'ru')).toEqual({})
  })

  it('prunes a folder override that matches the default and cleans up the folder key', () => {
    mergeFolderData(mechDir, 'blog', { label: 'Blog' })
    mergeLocaleFolderData(mechDir, 'ru', 'blog', { label: 'Блог' })
    mergeLocaleFolderData(mechDir, 'ru', 'blog', { label: 'Blog' })
    expect(readFolderData(mechDir, 'blog', 'ru')).toEqual({ label: 'Blog' })
    expect(fs.existsSync(join(mechDir, 'folders.ru.json'))).toBe(false)
  })
})
