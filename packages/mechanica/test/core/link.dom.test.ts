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
})
