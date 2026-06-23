import { describe, it, expect } from 'vitest'
import { registerFieldSchemas } from '@mechanica/shared'
import { createEditorStore } from '@/editor/store'

registerFieldSchemas(() => {})

const components = [
  { blockId: 'hero', __name: 'Hero', blockSchema: { name: 'Hero', props: { title: 'string' } } },
  { blockId: 'spacer', __name: 'Spacer', blockSchema: { hidden: true } },
]

describe('editor store', () => {
  it('exposes visible block metadata only', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    expect(store.blocks.map((b) => b.id)).toEqual(['hero'])
  })

  it('adds, selects and removes blocks', () => {
    const store = createEditorStore({ content: [], data: {} }, components)

    store.addBlock('hero')
    expect(store.content).toHaveLength(1)
    expect(store.selected?.blockId).toBe('hero')
    expect(store.selectedSchema?.properties.title).toBeDefined()

    store.remove(store.content[0]!.id)
    expect(store.content).toHaveLength(0)
    expect(store.selectedId).toBeNull()
  })

  it('copies and pastes a block with fresh ids', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    store.addBlock('hero')
    const original = store.content[0]!
    original.data.title = 'Source'

    store.copy(original.id)
    store.paste(original.id)

    expect(store.content).toHaveLength(2)
    const pasted = store.content[1]!
    expect(pasted.blockId).toBe('hero')
    expect(pasted.id).not.toBe(original.id)
    expect(pasted.data.title).toBe('Source')
    // Editing the original must not affect the pasted clone.
    original.data.title = 'Changed'
    expect(pasted.data.title).toBe('Source')
  })

  it('cuts a block to the clipboard', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    store.addBlock('hero')
    const id = store.content[0]!.id
    store.cut(id)
    expect(store.content).toHaveLength(0)
    store.paste(null)
    expect(store.content).toHaveLength(1)
  })
})
