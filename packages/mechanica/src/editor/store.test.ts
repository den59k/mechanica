import { describe, it, expect } from 'vitest'
import { registerFieldSchemas } from '@mechanica/shared'
import { createEditorStore } from './store'

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
})
