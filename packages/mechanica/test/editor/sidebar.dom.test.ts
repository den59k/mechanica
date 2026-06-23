import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h } from 'vue'
import { registerFieldSchemas } from '@mechanica/shared'
import { createEditorStore, editorStoreKey, type EditorStore } from '@/editor/store'
import { registerBuiltinFieldEditors } from '@/editor/fields/builtin'
import { clearFieldEditors } from '@/editor/fields/registry'
import BlockPalette from '@/editor/BlockPalette.vue'
import HierarchyTree from '@/editor/HierarchyTree.vue'
import BlockSettings from '@/editor/BlockSettings.vue'

beforeEach(() => {
  clearFieldEditors()
  registerBuiltinFieldEditors()
  registerFieldSchemas(() => {})
})

const components = [
  { blockId: 'hero', __name: 'Hero', blockSchema: { name: 'Hero', category: 'Content', props: { title: 'string' } } },
]

function mount(component: any, store: EditorStore) {
  const el = document.createElement('div')
  const app = createApp({ render: () => h(component) })
  app.provide(editorStoreKey, store)
  app.mount(el)
  return el
}

describe('editor sidebar', () => {
  it('palette adds a block when clicked', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    const el = mount(BlockPalette, store)
    expect(el.textContent).toContain('Content') // category title
    el.querySelector<HTMLButtonElement>('.mech-palette__item')!.click()
    expect(store.content).toHaveLength(1)
  })

  it('hierarchy lists blocks and selects on click', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    store.addBlock('hero')
    store.select(null)
    const el = mount(HierarchyTree, store)
    expect(el.textContent).toContain('Hero')
    el.querySelector<HTMLElement>('.mech-tree__row')!.click()
    expect(store.selectedId).toBe(store.content[0]!.id)
  })

  it('settings shows the selected block form and edits flow into data', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    store.addBlock('hero')
    const el = mount(BlockSettings, store)
    expect(el.textContent).toContain('Hero')
    const input = el.querySelector('input')!
    input.value = 'New heading'
    input.dispatchEvent(new Event('input'))
    expect(store.content[0]!.data.title).toBe('New heading')
  })
})
