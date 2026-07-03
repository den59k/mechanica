import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { serializePage } from '@mechanica/shared/page-format'
import { resolveDevQuery } from '@/vite/dev/query-dev'

let mechDir: string

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
  fs.mkdirSync(join(mechDir, 'pages', 'blog'), { recursive: true })
  fs.writeFileSync(join(mechDir, 'pages', 'index.page.md'), serializePage({ content: [], data: {}, name: 'Home' }))
  fs.writeFileSync(join(mechDir, 'pages', 'about.page.md'), serializePage({ content: [], data: {}, name: 'About' }))
  for (const [slug, date] of [['one', '2026-01-05'], ['two', '2026-03-01'], ['three', '2026-02-11']] as const) {
    fs.writeFileSync(
      join(mechDir, 'pages', 'blog', `${slug}.page.md`),
      serializePage({ content: [], data: { postMeta: { date } }, name: slug }),
    )
  }
})
afterEach(() => fs.rmSync(mechDir, { recursive: true, force: true }))

describe('resolveDevQuery', () => {
  it('resolves getPages and strips ordering fields', async () => {
    const result = (await resolveDevQuery(mechDir, 'getPages.' + JSON.stringify({ folderName: undefined }))) as Record<
      string,
      unknown
    >[]
    expect(result.map((p) => p.path)).toContain('/about')
    expect(result[0]).not.toHaveProperty('order')
    expect(result[0]).not.toHaveProperty('orderAfter')
    expect(result[0]).not.toHaveProperty('folderPath')
  })

  it('filters by folder, embeds data, and sorts by a data field', async () => {
    const key =
      'getPages.' +
      JSON.stringify({ folderName: 'blog', data: [{ id: 'postMeta' }], sort: { by: 'postMeta.date', dir: 'desc' } })
    const result = (await resolveDevQuery(mechDir, key)) as Array<{ path: string; postMeta: { date: string } }>
    expect(result.map((p) => p.path)).toEqual(['/blog/two', '/blog/three', '/blog/one'])
    expect(result[0]!.postMeta.date).toBe('2026-03-01')
  })

  it('slices paginated queries by the context page number', async () => {
    const key = 'getPages.' + JSON.stringify({ folderName: 'blog', sort: { by: 'name' }, pageSize: 2 })
    const first = (await resolveDevQuery(mechDir, key)) as { items: unknown[]; page: number; pageCount: number }
    expect(first.page).toBe(1)
    expect(first.pageCount).toBe(2)
    expect(first.items).toHaveLength(2)

    const second = (await resolveDevQuery(mechDir, key, { page: 2 })) as { items: unknown[]; page: number }
    expect(second.page).toBe(2)
    expect(second.items).toHaveLength(1)
  })

  it('returns an empty object for unknown query types', async () => {
    expect(await resolveDevQuery(mechDir, 'unknown.{}')).toEqual({})
  })
})
