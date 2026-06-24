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
  { id: 'site', title: 'Site', scope: 'site', props: { type: 'object', properties: { name: { type: 'string' } } } },
  { id: 'head', title: 'Head', scope: 'page', props: { type: 'object', properties: { title: { type: 'string' } } } },
]

function mount(store: EditorStore) {
  const el = document.createElement('div')
  const app = createApp({ render: () => h(DataSettings) })
  app.provide(editorStoreKey, store)
  app.mount(el)
  return { el, app }
}

const labelsIn = (el: HTMLElement) => [...el.querySelectorAll('.mech-field__label')].map((l) => l.textContent)

describe('DataSettings tabs', () => {
  it('renders one tab per entry and switches the active form', async () => {
    const store = createEditorStore({ content: [], data: {} }, [], entries)
    const { el } = mount(store)

    const tabs = [...el.querySelectorAll<HTMLButtonElement>('.mech-data__tab')]
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Site', 'Head'])

    // First entry (broadest scope) is active by default → its "name" field shows.
    expect(labelsIn(el)).toContain('Name')

    tabs[1]!.click()
    await nextTick()
    expect(labelsIn(el)).toContain('Title')
    expect(labelsIn(el)).not.toContain('Name')
  })

  it('omits the tab bar when there is a single entry', () => {
    const store = createEditorStore({ content: [], data: {} }, [], [entries[0]!])
    const { el } = mount(store)
    expect(el.querySelector('.mech-data__tabs')).toBeNull()
    expect(labelsIn(el)).toContain('Name')
  })
})
