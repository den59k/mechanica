import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import {
  splitDataByScope,
  readSiteData,
  mergeSiteData,
  folderOf,
  readFolderData,
  mergeFolderData,
} from '@/vite/dev/data-store'

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

describe('splitDataByScope', () => {
  it('routes ids into site / folder / page buckets by scope', () => {
    const { page, site, folder } = splitDataByScope(
      { header: { logo: 'a' }, nav: { items: [] }, hero: { title: 'b' }, footer: { year: 2026 } },
      { header: 'site', nav: 'folder', hero: 'page' },
    )
    expect(site).toEqual({ header: { logo: 'a' } })
    expect(folder).toEqual({ nav: { items: [] } })
    // `hero` is page-scoped and `footer` has no declared scope → both stay on the page.
    expect(page).toEqual({ hero: { title: 'b' }, footer: { year: 2026 } })
  })

  it('keeps everything on the page when no scopes are given', () => {
    const { page, site, folder } = splitDataByScope({ a: 1, b: 2 })
    expect(page).toEqual({ a: 1, b: 2 })
    expect(site).toEqual({})
    expect(folder).toEqual({})
  })
})

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
