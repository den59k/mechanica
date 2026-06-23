import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h } from 'vue'
import { registerFieldSchemas } from '@mechanica/shared'
import { createEditorStore, editorStoreKey, type EditorStore } from '@/editor/lib/store'
import { createDragController, dragKey } from '@/editor/lib/drag-controller'
import { registerBuiltinFieldEditors } from '@/editor/fields/builtin'
import { clearFieldEditors } from '@/editor/fields/registry'
import BlockPalette from '@/editor/components/BlockPalette.vue'
import HierarchyTree from '@/editor/components/HierarchyTree.vue'
import BlockSettings from '@/editor/components/BlockSettings.vue'

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
  app.provide(dragKey, createDragController(store))
  app.mount(el)
  return el
}

/** Press and release without moving — the drag controller treats this as a tap. */
function tap(element: Element) {
  const down = new Event('pointerdown', { bubbles: true })
  Object.assign(down, { clientX: 0, clientY: 0 })
  element.dispatchEvent(down)
  const up = new Event('pointerup')
  Object.assign(up, { clientX: 0, clientY: 0 })
  window.dispatchEvent(up)
}

describe('editor sidebar', () => {
  it('palette adds a block on tap', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    const el = mount(BlockPalette, store)
    expect(el.textContent).toContain('Content') // category title
    tap(el.querySelector('.mech-palette__item')!)
    expect(store.content).toHaveLength(1)
  })

  it('hierarchy lists blocks and selects on tap', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    store.addBlock('hero')
    store.select(null)
    const el = mount(HierarchyTree, store)
    expect(el.textContent).toContain('Hero')
    tap(el.querySelector('.mech-tree__row')!)
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
