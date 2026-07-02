import { describe, it, expect } from 'vitest'
import {
  parseQueryKey,
  isPaginatedQuery,
  resolvePagesQuery,
  resolveQueryKey,
  type QuerySource,
  type PaginatedPagesResult,
} from '@/query-engine'

const source: QuerySource = {
  listPages: ({ data } = {}) => {
    const pages = [
      { path: '/', name: 'Home', folderPath: null, order: 0, orderAfter: null },
      { path: '/about', name: 'About', folderPath: null, order: 1, orderAfter: null },
      { path: '/blog', name: 'Blog', folderPath: 'blog', order: 0, orderAfter: null },
      { path: '/blog/a', name: 'Alpha', folderPath: 'blog', order: 0, orderAfter: null, meta: { date: '2026-02-01', views: 5 } },
      { path: '/blog/b', name: 'Beta', folderPath: 'blog', order: 0, orderAfter: null, meta: { date: '2026-03-01', views: 40 } },
      { path: '/blog/c', name: 'Gamma', folderPath: 'blog', order: 0, orderAfter: null, meta: { date: '2026-01-15' } },
    ]
    // Mirror the store: only embed requested data entries.
    return pages.map(({ meta, ...page }) => (data?.some((entry) => entry.id === 'meta') ? { ...page, meta } : page))
  },
}

describe('parseQueryKey', () => {
  it('splits type and JSON args', () => {
    expect(parseQueryKey('getPages.{"folderName":"blog"}')).toEqual({
      type: 'getPages',
      args: { folderName: 'blog' },
    })
    expect(parseQueryKey('getPages.')).toEqual({ type: 'getPages', args: {} })
    expect(parseQueryKey('weird')).toEqual({ type: 'weird', args: {} })
    expect(parseQueryKey('broken.{oops')).toEqual({ type: 'broken', args: {} })
  })

  it('flags paginated getPages keys', () => {
    expect(isPaginatedQuery('getPages.{"pageSize":10}')).toBe(true)
    expect(isPaginatedQuery('getPages.{"limit":10}')).toBe(false)
    expect(isPaginatedQuery('fetch.{"url":"x","pageSize":10}')).toBe(false)
  })
})

describe('resolvePagesQuery', () => {
  it('filters by folder, excluding the folder index page, and strips internal fields', () => {
    const result = resolvePagesQuery(source, { folderName: 'blog' }) as Array<Record<string, unknown>>
    // `/blog` itself (the page doing the listing) is not among its own results.
    expect(result.map((p) => p.path)).toEqual(['/blog/a', '/blog/b', '/blog/c'])
    expect(result[0]).not.toHaveProperty('order')
    expect(result[0]).not.toHaveProperty('orderAfter')
    expect(result[0]).not.toHaveProperty('folderPath')
  })

  it('sorts by name and by a dotted data field, missing values last', () => {
    const byName = resolvePagesQuery(source, { sort: { by: 'name', dir: 'desc' } }) as Array<{ name: string }>
    expect(byName.map((p) => p.name)).toEqual(['Home', 'Gamma', 'Blog', 'Beta', 'Alpha', 'About'])

    const byDate = resolvePagesQuery(source, {
      folderName: 'blog',
      data: [{ id: 'meta' }],
      sort: { by: 'meta.date', dir: 'desc' },
    }) as Array<{ path: string }>
    expect(byDate.map((p) => p.path)).toEqual(['/blog/b', '/blog/a', '/blog/c'])

    // Pages without the field sort last even descending.
    const byViews = resolvePagesQuery(source, {
      folderName: 'blog',
      data: [{ id: 'meta' }],
      sort: { by: 'meta.views', dir: 'desc' },
    }) as Array<{ path: string }>
    expect(byViews.map((p) => p.path)).toEqual(['/blog/b', '/blog/a', '/blog/c'])
  })

  it('caps results with limit', () => {
    const result = resolvePagesQuery(source, { limit: 2 }) as unknown[]
    expect(result).toHaveLength(2)
  })

  it('paginates with pageSize, clamping the page number', () => {
    const first = resolvePagesQuery(source, { folderName: 'blog', pageSize: 2 }) as PaginatedPagesResult
    expect(first).toMatchObject({ page: 1, pageCount: 2, pageSize: 2, total: 3 })
    expect(first.items).toHaveLength(2)

    const second = resolvePagesQuery(source, { folderName: 'blog', pageSize: 2 }, { page: 2 }) as PaginatedPagesResult
    expect(second.page).toBe(2)
    expect(second.items.map((p) => p.path)).toEqual(['/blog/c'])

    const clamped = resolvePagesQuery(source, { folderName: 'blog', pageSize: 2 }, { page: 99 }) as PaginatedPagesResult
    expect(clamped.page).toBe(2)

    const empty = resolvePagesQuery(source, { folderName: 'nope', pageSize: 2 }) as PaginatedPagesResult
    expect(empty).toMatchObject({ page: 1, pageCount: 1, total: 0, items: [] })
  })
})

describe('resolveQueryKey', () => {
  it('routes getPages through the pages resolver', async () => {
    const result = (await resolveQueryKey(source, 'getPages.{"folderName":"blog"}')) as unknown[]
    expect(result).toHaveLength(3)
  })

  it('resolves fetch keys through the source, or {} without fetchJson', async () => {
    expect(await resolveQueryKey(source, 'fetch.{"url":"https://x"}')).toEqual({})

    const fetching: QuerySource = {
      ...source,
      fetchJson: async ({ url }) => ({ from: url }),
    }
    expect(await resolveQueryKey(fetching, 'fetch.{"url":"https://x"}')).toEqual({ from: 'https://x' })
    expect(await resolveQueryKey(fetching, 'fetch.{}')).toEqual({}) // no url — nothing to fetch
  })

  it('resolves unknown types to an empty object', async () => {
    expect(await resolveQueryKey(source, 'nope.{}')).toEqual({})
  })
})
