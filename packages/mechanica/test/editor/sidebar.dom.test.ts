import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h, nextTick } from 'vue'
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

function mount(component: any, store: EditorStore, drag = createDragController(store)) {
  const el = document.createElement('div')
  const app = createApp({ render: () => h(component) })
  app.provide(editorStoreKey, store)
  app.provide(dragKey, drag)
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

  it('shows named slots as drop targets and places a block into a chosen slot', () => {
    const withSlots = [
      ...components,
      { blockId: 'split', __name: 'Split', blockSchema: { name: 'Split', slots: { start: true, end: true } } },
    ]
    const store = createEditorStore({ content: [], data: {} }, withSlots)
    store.addBlock('split')
    store.select(null)
    const el = mount(HierarchyTree, store)

    expect([...el.querySelectorAll('.mech-tree__slot-name')].map((n) => n.textContent)).toEqual(['start', 'end'])
    const split = store.content[0]!
    expect(el.querySelector(`[data-tree-slot="${split.id}:end"]`)).not.toBeNull()

    // A drop into the 'end' slot lands in that slot only.
    store.addBlockAt('hero', { anchorId: split.id, position: 'inside', slot: 'end' })
    expect((split.children as Record<string, unknown[]>).end).toHaveLength(1)
    expect((split.children as Record<string, unknown[]>).start ?? []).toHaveLength(0)
  })

  it('badges blocks by slot kind — default, named, or none', () => {
    const set = [
      ...components, // hero — no slots
      { blockId: 'section', __name: 'Section', blockSchema: { name: 'Section', slots: { default: true } } },
      { blockId: 'split', __name: 'Split', blockSchema: { name: 'Split', slots: { start: true, end: true } } },
    ]
    const store = createEditorStore({ content: [], data: {} }, set)
    store.addBlock('section')
    store.addBlock('split')
    store.addBlock('hero')
    store.select(null)
    const el = mount(HierarchyTree, store)
    const badge = (id: string) =>
      el.querySelector(`[data-tree-id="${id}"]`)!.querySelector('.mech-tree__slot-badge')

    expect(badge(store.content[0]!.id)?.getAttribute('title')).toContain('content slot') // section → default
    expect(badge(store.content[1]!.id)?.getAttribute('title')).toContain('named slot') // split → named
    expect(badge(store.content[2]!.id)).toBeNull() // hero → no slots
  })

  it('paints the active drop onto the matching tree node (page ↔ tree sync)', async () => {
    const withSlots = [
      ...components,
      { blockId: 'split', __name: 'Split', blockSchema: { name: 'Split', slots: { start: true, end: true } } },
    ]
    const store = createEditorStore({ content: [], data: {} }, withSlots)
    store.addBlock('hero')
    store.addBlock('split')
    store.select(null)
    const drag = createDragController(store)
    const el = mount(HierarchyTree, store, drag)
    const hero = store.content[0]!
    const split = store.content[1]!

    // An "insert before hero" drop (wherever it was computed) lights up that row.
    drag.drop = { anchorId: hero.id, position: 'before' }
    drag.container = null
    await nextTick()
    expect(el.querySelector(`[data-tree-id="${hero.id}"]`)!.classList.contains('is-drop-before')).toBe(true)

    // A named-slot drop lights up that slot node — and tints its owner row — but
    // not the sibling slot.
    drag.drop = { anchorId: split.id, position: 'inside', slot: 'end' }
    drag.container = { parentId: split.id, slot: 'end' }
    await nextTick()
    const endSlot = el.querySelector(`[data-tree-slot="${split.id}:end"]`)!
    expect(endSlot.classList.contains('is-drop-target')).toBe(true)
    // Pointer is over the slot node itself → it's outlined, not just filled.
    expect(endSlot.classList.contains('is-drop-outline')).toBe(true)
    expect(el.querySelector(`[data-tree-slot="${split.id}:start"]`)!.classList.contains('is-drop-target')).toBe(false)
    expect(el.querySelector(`[data-tree-id="${split.id}"]`)!.classList.contains('is-drop-within')).toBe(true)
  })

  it('settings shows the selected block form and edits flow into data', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    store.addBlock('hero')
    const el = mount(BlockSettings, store)
    expect(el.textContent).toContain('Title') // humanized field label
    const input = el.querySelector('input')!
    input.value = 'New heading'
    input.dispatchEvent(new Event('input'))
    expect(store.content[0]!.data.title).toBe('New heading')
  })
})
