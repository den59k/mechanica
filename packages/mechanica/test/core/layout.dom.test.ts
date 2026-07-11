import { describe, it, expect } from 'vitest'
import { h, nextTick } from 'vue'
import { defineMechanicaApp, createMechanicaApp } from '@/core/define-mechanica-app'
import { Layout, useLayout, resolveLayoutName } from '@/core/layout'
import { pushStateUpdate } from '@/editor/lib/bridge'
import type { State } from 'mechanica-shared'

const SiteLayout = { render: () => h('div', { class: 'site-shell' }, 'site') }
const DocsLayout = { render: () => h('div', { class: 'docs-shell' }, 'docs') }
const Root = { render: () => h(Layout) }

function mount(state: State, layouts?: Record<string, any>) {
  const def = defineMechanicaApp({ root: Root, layouts })
  const app = createMechanicaApp(def, { mode: 'dev', state })
  const el = document.createElement('div')
  app.mount(el)
  return el
}

describe('resolveLayoutName', () => {
  const layouts = { site: SiteLayout, docs: DocsLayout }

  it('picks the page layout when the map knows it', () => {
    expect(resolveLayoutName(layouts, 'docs')).toBe('docs')
  })

  it('falls back to the first (default) entry for unset or unknown layouts', () => {
    expect(resolveLayoutName(layouts, undefined)).toBe('site')
    expect(resolveLayoutName(layouts, 'gone')).toBe('site')
  })

  it('resolves to none without a layouts map', () => {
    expect(resolveLayoutName(undefined, 'docs')).toBe('')
    expect(resolveLayoutName({}, 'docs')).toBe('')
  })
})

describe('<Layout>', () => {
  it('renders the page layout from the app map', () => {
    const el = mount({ content: [], data: {}, page: { path: '/docs', layout: 'docs' } }, { site: SiteLayout, docs: DocsLayout })
    expect(el.querySelector('.docs-shell')).toBeTruthy()
    expect(el.querySelector('.site-shell')).toBeNull()
  })

  it('renders the default (first) layout when the page sets none', () => {
    const el = mount({ content: [], data: {}, page: { path: '/' } }, { site: SiteLayout, docs: DocsLayout })
    expect(el.querySelector('.site-shell')).toBeTruthy()
  })

  it('falls back to <Content> when the app declares no layouts', () => {
    const el = mount({ content: [], data: {}, page: { path: '/' } })
    // Content renders the (empty) block list — no layout shells, no crash.
    expect(el.querySelector('.site-shell')).toBeNull()
    expect(el.querySelector('.docs-shell')).toBeNull()
  })

  it('switches live when the editor pushes a page meta with a new layout', async () => {
    const el = mount({ content: [], data: {}, page: { path: '/x' } }, { site: SiteLayout, docs: DocsLayout })
    expect(el.querySelector('.site-shell')).toBeTruthy()

    // Same channel the editor's layout picker uses.
    pushStateUpdate({ content: [], page: { path: '/x', layout: 'docs' } })
    await new Promise((resolve) => setTimeout(resolve, 0)) // postMessage delivery
    await nextTick()
    expect(el.querySelector('.docs-shell')).toBeTruthy()
    expect(el.querySelector('.site-shell')).toBeNull()
  })
})

describe('useLayout', () => {
  it('exposes the active name and the declared names', () => {
    let seen: { name: string; names: string[] } | undefined
    const Probe = {
      setup() {
        const { name, names } = useLayout()
        return () => {
          seen = { name: name.value, names }
          return h('span')
        }
      },
    }
    const def = defineMechanicaApp({ root: Probe, layouts: { site: SiteLayout, docs: DocsLayout } })
    const app = createMechanicaApp(def, {
      mode: 'dev',
      state: { content: [], data: {}, page: { path: '/d', layout: 'docs' } },
    })
    app.mount(document.createElement('div'))
    expect(seen).toEqual({ name: 'docs', names: ['site', 'docs'] })
  })
})
