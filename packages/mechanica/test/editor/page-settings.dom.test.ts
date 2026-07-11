import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp, h } from 'vue'
import { registerFieldSchemas } from 'mechanica-shared'
import { createEditorStore, editorStoreKey, type EditorStore } from '@/editor/lib/store'
import PageSettings from '@/editor/components/PageSettings.vue'

registerFieldSchemas(() => {})

const RUNTIME_KEY = '__MECHANICA_RUNTIME__'

const components = [
  { blockId: 'hero', __name: 'Hero', blockSchema: { name: 'Hero', props: { title: 'string' } } },
  { blockId: 'not-found', __name: 'NotFound', blockSchema: { name: 'Not found page', standalone: true } },
]

function mount(store: EditorStore) {
  const el = document.createElement('div')
  const app = createApp({ render: () => h(PageSettings) })
  app.provide(editorStoreKey, store)
  app.mount(el)
  return el
}

beforeEach(() => {
  // PageSettings reads the app's layout names off the runtime bridge.
  ;(window as unknown as Record<string, unknown>)[RUNTIME_KEY] = { layoutNames: ['site', 'bare'] }
})
afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[RUNTIME_KEY]
})

describe('PageSettings (page setup pane)', () => {
  it('shows layout radio cards, marks the default, and writes the store layout', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    const el = mount(store)

    const choices = [...el.querySelectorAll('.mech-page-setup__choice')] as HTMLButtonElement[]
    expect(choices.map((c) => c.textContent)).toEqual(['SiteDefault', 'Bare'])
    expect(choices[0]!.getAttribute('aria-checked')).toBe('true') // no layout set → default active

    choices[1]!.click()
    expect(store.layout).toBe('bare')
    choices[0]!.click()
    expect(store.layout).toBeNull() // picking the default clears the key
  })

  it('reflects an explicit page layout as the active card', () => {
    const store = createEditorStore({ content: [], data: {}, page: { layout: 'bare' } }, components)
    const el = mount(store)
    expect(el.querySelector('.mech-page-setup__choice.is-active')!.textContent).toContain('Bare')
  })

  it('locks the layout while editing a translation', () => {
    const store = createEditorStore(
      { content: [], data: {}, page: { locale: 'ru' }, locales: { default: 'en', all: ['en', 'ru'] } },
      components,
    )
    const el = mount(store)
    expect((el.querySelector('.mech-page-setup__choice') as HTMLButtonElement).disabled).toBe(true)
    expect(el.textContent).toContain('translations follow it')
  })

  it('offers the page-block select with standalone blocks only', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    const el = mount(store)
    // The select renders with the empty-page placeholder; hero (not standalone)
    // is not an option — only the standalone page block is.
    expect(el.textContent).toContain('Page block')
    expect(el.textContent).toContain('Choose a block…')
  })

  it('shows "Custom blocks" for a page with regular content', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    store.addBlock('hero')
    const el = mount(store)
    expect(el.textContent).toContain('Custom blocks')
  })
})
