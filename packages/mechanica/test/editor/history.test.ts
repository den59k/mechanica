import { describe, it, expect } from 'vitest'
import { registerFieldSchemas } from 'mechanica-shared'
import { createEditorStore } from '@/editor/lib/store'
import { createHistory } from '@/editor/lib/history'

registerFieldSchemas(() => {})

const components = [{ blockId: 'hero', __name: 'Hero', blockSchema: { name: 'Hero', props: {} } }]

describe('createHistory', () => {
  it('undoes and redoes structural changes', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    const history = createHistory(store)

    store.addBlock('hero')
    history.commit()
    expect(store.content).toHaveLength(1)
    expect(history.canUndo.value).toBe(true)
    expect(history.canRedo.value).toBe(false)

    history.undo()
    expect(store.content).toHaveLength(0)
    expect(history.canRedo.value).toBe(true)

    history.redo()
    expect(store.content).toHaveLength(1)

    history.dispose()
  })

  it('coalesces until commit and ignores no-op commits', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    const history = createHistory(store)

    store.addBlock('hero')
    store.addBlock('hero')
    history.commit() // one entry for both adds
    expect(store.content).toHaveLength(2)

    history.commit() // nothing changed → no new entry
    history.undo()
    expect(store.content).toHaveLength(0) // single undo reverts both

    history.dispose()
  })
})
