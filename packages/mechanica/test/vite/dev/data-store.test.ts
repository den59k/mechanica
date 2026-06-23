import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { splitDataByScope, readSiteData, mergeSiteData } from '@/vite/dev/data-store'

let mechDir: string

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
})
afterEach(() => fs.rmSync(mechDir, { recursive: true, force: true }))

describe('splitDataByScope', () => {
  it('routes site-scoped ids to the site bucket and the rest to the page', () => {
    const { page, site } = splitDataByScope(
      { header: { logo: 'a' }, hero: { title: 'b' }, footer: { year: 2026 } },
      { header: 'site', hero: 'page' },
    )
    expect(site).toEqual({ header: { logo: 'a' } })
    // `hero` is page-scoped and `footer` has no declared scope → both stay on the page.
    expect(page).toEqual({ hero: { title: 'b' }, footer: { year: 2026 } })
  })

  it('keeps everything on the page when no scopes are given', () => {
    const { page, site } = splitDataByScope({ a: 1, b: 2 })
    expect(page).toEqual({ a: 1, b: 2 })
    expect(site).toEqual({})
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
