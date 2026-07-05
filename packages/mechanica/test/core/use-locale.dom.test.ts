import { describe, it, expect } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import type { State } from 'mechanica-shared'
import { createMechanica } from '@/core/create-mechanica'
import { useLocale, type UseLocale } from '@/core/use-locale'

function mountUseLocale(state: State): UseLocale {
  let captured: UseLocale | undefined
  const Comp = defineComponent({
    setup() {
      captured = useLocale()
      return () => h('div')
    },
  })
  createApp(Comp).use(createMechanica({ mode: 'client', state })).mount(document.createElement('div'))
  return captured!
}

describe('useLocale', () => {
  it('exposes the current locale, translations and path helper', () => {
    const loc = mountUseLocale({
      content: [],
      data: {},
      locales: { default: 'en', all: ['en', 'ru'] },
      page: { path: '/about', locale: 'ru', locales: ['en', 'ru'] },
    })
    expect(loc.enabled).toBe(true)
    expect(loc.locale.value).toBe('ru')
    expect(loc.locales.value).toEqual(['en', 'ru'])
    expect(loc.localePath('/about')).toBe('/ru/about') // current locale
    expect(loc.localePath('/about', 'en')).toBe('/about') // explicit default
    expect(loc.localePath('/about', 'ru')).toBe('/ru/about')
  })

  it('is inert on a single-language site', () => {
    const loc = mountUseLocale({ content: [], data: {} })
    expect(loc.enabled).toBe(false)
    expect(loc.locale.value).toBe('')
    expect(loc.locales.value).toEqual([])
    expect(loc.localePath('/about', 'ru')).toBe('/about')
  })
})
