import { describe, it, expect } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import type { PageMeta, State } from 'mechanica-shared'
import { createMechanica } from '@/core/create-mechanica'
import { Link } from '@/core/link'

function render(to: any, slot = 'Go') {
  const el = document.createElement('div')
  const state: State = { content: [], data: {} }
  createApp({ render: () => h(Link, { to }, () => slot) })
    .use(createMechanica({ mode: 'client', state }))
    .mount(el)
  return el.querySelector('a')!
}

describe('<Link>', () => {
  it('renders an internal path as an SPA anchor', () => {
    const a = render('/pricing')
    expect(a.getAttribute('href')).toBe('/pricing')
    expect(a.getAttribute('target')).toBeNull()
    expect(a.textContent).toBe('Go')
  })

  it('renders an external string as a plain anchor', () => {
    const a = render('https://example.com')
    expect(a.getAttribute('href')).toBe('https://example.com')
  })

  it('handles a smartLink object with new-tab', () => {
    const a = render({ url: 'https://x.com', external: true, openNewTab: true, title: 'X' })
    expect(a.getAttribute('href')).toBe('https://x.com')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener')
  })

  it('updates its active class after an in-place page switch (bridge setPage)', async () => {
    const a = render('/pricing')
    expect(a.classList.contains('is-active')).toBe(false)

    const runtime = (window as unknown as Record<string, unknown>).__MECHANICA_RUNTIME__ as {
      setPage?: (page: PageMeta) => void
    }
    runtime.setPage?.({ path: '/pricing' })
    await nextTick()
    expect(a.classList.contains('is-active')).toBe(true)
  })

  it('adds no active class when disabled with :active-class="false"', async () => {
    const el = document.createElement('div')
    const state: State = { content: [], data: {} }
    createApp({ render: () => h(Link, { to: '/pricing', activeClass: false }, () => 'Go') })
      .use(createMechanica({ mode: 'client', state }))
      .mount(el)
    const a = el.querySelector('a')!
    const runtime = (window as unknown as Record<string, unknown>).__MECHANICA_RUNTIME__ as {
      setPage?: (page: PageMeta) => void
    }
    runtime.setPage?.({ path: '/pricing' })
    await nextTick()
    expect(a.className).toBe('')
  })
})

function renderLocalized(to: any, opts: { locale?: string; prop?: string } = {}) {
  const el = document.createElement('div')
  const state: State = {
    content: [],
    data: {},
    locales: { default: 'en', all: ['en', 'ru'] },
    page: { path: '/', locale: opts.locale ?? 'en' },
  }
  createApp({ render: () => h(Link, { to, locale: opts.prop }, () => 'Go') })
    .use(createMechanica({ mode: 'client', state }))
    .mount(el)
  return el.querySelector('a')!
}

describe('<Link> locale prefixing', () => {
  it('prefixes an internal logical path for the current non-default locale', () => {
    expect(renderLocalized('/about', { locale: 'ru' }).getAttribute('href')).toBe('/ru/about')
  })

  it('leaves the default locale unprefixed', () => {
    expect(renderLocalized('/about', { locale: 'en' }).getAttribute('href')).toBe('/about')
  })

  it('targets a specific locale via the `locale` prop (language switcher)', () => {
    // From an RU page, link back to the default-locale version.
    expect(renderLocalized('/about', { locale: 'ru', prop: 'en' }).getAttribute('href')).toBe('/about')
    // From an EN page, link to the RU version.
    expect(renderLocalized('/about', { locale: 'en', prop: 'ru' }).getAttribute('href')).toBe('/ru/about')
  })

  it('never prefixes external links', () => {
    expect(renderLocalized('https://x.com', { locale: 'ru' }).getAttribute('href')).toBe('https://x.com')
  })
})

/**
 * The server has no address bar: its router starts at the page's served path
 * (locale prefix + pagination variant), so the prerendered `is-active` is the
 * one the client computes from `window.location` on hydration.
 */
describe('<Link> active state on the server', () => {
  const ssr = async (to: string, page: PageMeta) => {
    const { createSSRApp } = await import('vue')
    const { renderToString } = await import('vue/server-renderer')
    const state: State = { content: [], data: {}, locales: { default: 'en', all: ['en', 'ru'] }, page }
    const app = createSSRApp({ render: () => h(Link, { to }, () => 'Go') }).use(
      createMechanica({ mode: 'server', state }),
    )
    return renderToString(app)
  }

  it('marks the link to the page being rendered', async () => {
    expect(await ssr('/about', { path: '/about' })).toContain('class="is-active"')
    expect(await ssr('/', { path: '/about' })).not.toContain('is-active')
  })

  it('matches under the locale prefix of a translation', async () => {
    expect(await ssr('/about', { path: '/about', locale: 'ru' })).toContain('class="is-active"')
    expect(await ssr('/about', { path: '/', locale: 'ru' })).not.toContain('is-active')
  })

  it('matches the pagination variant, not its base page', async () => {
    expect(await ssr('/blog/2', { path: '/blog', pagination: { page: 2 } })).toContain('class="is-active"')
    expect(await ssr('/blog', { path: '/blog', pagination: { page: 2 } })).not.toContain('is-active')
  })
})
