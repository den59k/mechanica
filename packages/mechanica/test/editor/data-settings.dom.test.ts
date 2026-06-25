import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { registerFieldSchemas, type DataEntry } from '@mechanica/shared'
import { createEditorStore, editorStoreKey, type EditorStore } from '@/editor/lib/store'
import { registerBuiltinFieldEditors } from '@/editor/fields/builtin'
import { clearFieldEditors } from '@/editor/fields/registry'
import DataSettings from '@/editor/components/DataSettings.vue'

beforeEach(() => {
  clearFieldEditors()
  registerBuiltinFieldEditors()
  registerFieldSchemas(() => {})
})

const entries: DataEntry[] = [
  { id: 'site', title: 'Site', props: { type: 'object', properties: { name: { type: 'string' } } } },
  { id: 'head', title: 'Head', props: { type: 'object', properties: { title: { type: 'string' } } } },
]

function mount(store: EditorStore) {
  const el = document.createElement('div')
  const app = createApp({ render: () => h(DataSettings) })
  app.provide(editorStoreKey, store)
  app.mount(el)
  return { el, app }
}

const labelsIn = (el: HTMLElement) => [...el.querySelectorAll('.mech-field__label')].map((l) => l.textContent)
const rowFor = (el: HTMLElement, name: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('.mech-data__entry')].find(
    (r) => r.querySelector('.mech-data__entry-name')?.textContent?.trim() === name,
  )!
const segFor = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('.mech-data__seg')].find((s) => s.textContent?.trim() === label)!

describe('DataSettings', () => {
  it('lists every entry in the rail and switches the active form', async () => {
    const store = createEditorStore({ content: [], data: {} }, [], entries)
    const { el } = mount(store)

    const names = [...el.querySelectorAll('.mech-data__entry-name')].map((n) => n.textContent?.trim())
    expect(names).toEqual(['Head', 'Site']) // sorted by title

    // First entry (Head) is active by default → its "title" field shows.
    expect(labelsIn(el)).toContain('Title')

    rowFor(el, 'Site').click()
    await nextTick()
    expect(labelsIn(el)).toContain('Name')
    expect(labelsIn(el)).not.toContain('Title')
  })

  it('switches scope and warns when editing site-wide data', async () => {
    const store = createEditorStore({ content: [], data: {}, siteData: { site: { name: 'Acme' } } }, [], entries)
    const { el } = mount(store)

    rowFor(el, 'Site').click()
    await nextTick()
    // The Site entry resolves from site data → the warning banner shows.
    expect(el.querySelector('.mech-data__note.is-warn')).not.toBeNull()

    segFor(el, 'This page').click()
    await nextTick()
    expect(store.scopeOf('site')).toBe('page')
    expect(el.querySelector('.mech-data__note.is-warn')).toBeNull()
  })

  it('hides the folder scope option when the page is not in a folder', () => {
    const store = createEditorStore({ content: [], data: {} }, [], entries)
    const { el } = mount(store)
    const labels = [...el.querySelectorAll('.mech-data__seg')].map((s) => s.textContent?.trim())
    expect(labels).toEqual(['Site', 'This page'])
  })
})
