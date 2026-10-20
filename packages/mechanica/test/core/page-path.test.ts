import { describe, it, expect } from 'vitest'
import { servedPagePath } from '@/core/page-path'

const locales = { default: 'en', all: ['en', 'ru'] }

describe('servedPagePath', () => {
  it('is the logical path for a default-locale page', () => {
    expect(servedPagePath({ path: '/about' })).toBe('/about')
    expect(servedPagePath({ path: '/about', locale: 'en' }, locales)).toBe('/about')
    expect(servedPagePath(undefined)).toBe('/')
  })

  it('prefixes a translation with its locale', () => {
    expect(servedPagePath({ path: '/about', locale: 'ru' }, locales)).toBe('/ru/about')
    expect(servedPagePath({ path: '/', locale: 'ru' }, locales)).toBe('/ru')
  })

  it('appends the pagination variant, after the locale prefix', () => {
    expect(servedPagePath({ path: '/blog', pagination: { page: 2 } })).toBe('/blog/2')
    expect(servedPagePath({ path: '/blog', pagination: { page: 1 } })).toBe('/blog')
    expect(servedPagePath({ path: '/', pagination: { page: 3 } })).toBe('/3')
    expect(servedPagePath({ path: '/blog', locale: 'ru', pagination: { page: 2 } }, locales)).toBe('/ru/blog/2')
  })

  it('keeps a variant suffix the export already put on the path', () => {
    // Dev serves `/blog/2` with the base `page.path`; the export bakes the
    // variant path itself. Both must land on the same address.
    expect(servedPagePath({ path: '/blog/2', pagination: { page: 2 } })).toBe('/blog/2')
    expect(servedPagePath({ path: '/blog/2', locale: 'ru', pagination: { page: 2 } }, locales)).toBe('/ru/blog/2')
    expect(servedPagePath({ path: '/2', pagination: { page: 2 } })).toBe('/2')
  })
})
