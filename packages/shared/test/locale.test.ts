import { describe, it, expect } from 'vitest'
import {
  normalizeLocales,
  isLocale,
  parseLocalePath,
  localePath,
  localeLabel,
  type LocalesConfig,
} from '@/locale'

const cfg: LocalesConfig = { default: 'en', all: ['en', 'ru', 'de'] }

describe('normalizeLocales', () => {
  it('accepts a full config', () => {
    expect(normalizeLocales({ default: 'en', all: ['en', 'ru'] })).toEqual({
      default: 'en',
      all: ['en', 'ru'],
      labels: undefined,
    })
  })

  it('accepts a bare code list (first is the default)', () => {
    expect(normalizeLocales(['en', 'ru', 'de'])).toEqual({
      default: 'en',
      all: ['en', 'ru', 'de'],
      labels: undefined,
    })
  })

  it('forces the default into `all` and de-duplicates', () => {
    expect(normalizeLocales({ default: 'en', all: ['ru', 'ru', 'de'] })).toEqual({
      default: 'en',
      all: ['en', 'ru', 'de'],
      labels: undefined,
    })
  })

  it('returns null when i18n is effectively off', () => {
    expect(normalizeLocales(undefined)).toBeNull()
    expect(normalizeLocales([])).toBeNull()
    expect(normalizeLocales(['en'])).toBeNull()
    expect(normalizeLocales({ default: 'en', all: ['en'] })).toBeNull()
  })

  it('keeps labels', () => {
    const result = normalizeLocales({ default: 'en', all: ['en', 'ru'], labels: { ru: 'Русский' } })
    expect(result?.labels).toEqual({ ru: 'Русский' })
  })
})

describe('parseLocalePath', () => {
  it('strips a non-default locale prefix', () => {
    expect(parseLocalePath('/ru/blog', cfg)).toEqual({ locale: 'ru', path: '/blog' })
    expect(parseLocalePath('/de/blog/post', cfg)).toEqual({ locale: 'de', path: '/blog/post' })
  })

  it('maps a bare locale prefix to that locale home', () => {
    expect(parseLocalePath('/ru', cfg)).toEqual({ locale: 'ru', path: '/' })
    expect(parseLocalePath('/ru/', cfg)).toEqual({ locale: 'ru', path: '/' })
  })

  it('keeps default-locale and unknown-prefix paths as-is', () => {
    expect(parseLocalePath('/blog', cfg)).toEqual({ locale: 'en', path: '/blog' })
    expect(parseLocalePath('/en/blog', cfg)).toEqual({ locale: 'en', path: '/en/blog' })
    expect(parseLocalePath('/ruble', cfg)).toEqual({ locale: 'en', path: '/ruble' })
    expect(parseLocalePath('/', cfg)).toEqual({ locale: 'en', path: '/' })
  })

  it('is inert without a config', () => {
    expect(parseLocalePath('/ru/blog', null)).toEqual({ locale: '', path: '/ru/blog' })
  })
})

describe('localePath', () => {
  it('prefixes non-default locales', () => {
    expect(localePath('/blog', 'ru', cfg)).toBe('/ru/blog')
    expect(localePath('/', 'ru', cfg)).toBe('/ru')
  })

  it('leaves the default locale and unknowns unchanged', () => {
    expect(localePath('/blog', 'en', cfg)).toBe('/blog')
    expect(localePath('/blog', 'zz', cfg)).toBe('/blog')
    expect(localePath('/blog', undefined, cfg)).toBe('/blog')
    expect(localePath('/blog', 'ru', null)).toBe('/blog')
  })

  it('round-trips with parseLocalePath', () => {
    for (const path of ['/', '/blog', '/blog/post', '/a/b/c']) {
      for (const loc of cfg.all) {
        expect(parseLocalePath(localePath(path, loc, cfg), cfg)).toEqual({ locale: loc, path })
      }
    }
  })
})

describe('isLocale / localeLabel', () => {
  it('recognizes known codes', () => {
    expect(isLocale(cfg, 'ru')).toBe(true)
    expect(isLocale(cfg, 'zz')).toBe(false)
    expect(isLocale(null, 'ru')).toBe(false)
  })

  it('falls back to the code when no label', () => {
    expect(localeLabel(cfg, 'ru')).toBe('ru')
    expect(localeLabel({ ...cfg, labels: { ru: 'Русский' } }, 'ru')).toBe('Русский')
  })
})
