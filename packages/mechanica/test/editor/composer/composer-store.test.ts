import { describe, it, expect } from 'vitest'
import type { ComposedBlockDefinition } from 'mechanica-shared'
import { createComposerStore } from '@/editor/composer/lib/composer-store'

const base = (): ComposedBlockDefinition => ({ id: 'hero', name: 'Hero', template: [] })

describe('composer store: adding elements', () => {
  it('appends to the root and selects the new node', () => {
    const store = createComposerStore(base())
    store.addElement('mech:frame')
    expect(store.template).toHaveLength(1)
    expect(store.template[0]!.blockId).toBe('mech:frame')
    expect(store.selectedId).toBe(store.template[0]!.id)
  })

  it('adds inside a selected frame (container)', () => {
    const store = createComposerStore(base())
    store.addElement('mech:frame')
    store.addElement('mech:text')
    const frame = store.template[0]!
    expect(store.template).toHaveLength(1)
    expect((frame.children as unknown[])).toHaveLength(1)
    expect((frame.children as { blockId: string }[])[0]!.blockId).toBe('mech:text')
  })

  it('adds after a selected leaf in the same parent', () => {
    const store = createComposerStore(base())
    store.addElement('mech:text')
    store.addElement('mech:image')
    // Both at root, image right after the text.
    expect(store.template.map((n) => n.blockId)).toEqual(['mech:text', 'mech:image'])
  })
})

describe('composer store: tree ops', () => {
  it('removes, clearing selection', () => {
    const store = createComposerStore(base())
    store.addElement('mech:text')
    const id = store.selectedId!
    store.remove(id)
    expect(store.template).toHaveLength(0)
    expect(store.selectedId).toBeNull()
  })

  it('duplicates and selects the copy', () => {
    const store = createComposerStore(base())
    store.addElement('mech:text')
    const id = store.selectedId!
    store.duplicate(id)
    expect(store.template).toHaveLength(2)
    expect(store.selectedId).not.toBe(id)
  })

  it('moves within the sibling list', () => {
    const store = createComposerStore(base())
    store.addElement('mech:text')
    store.addElement('mech:image')
    const imageId = store.template[1]!.id
    store.move(imageId, -1)
    expect(store.template.map((n) => n.blockId)).toEqual(['mech:image', 'mech:text'])
  })
})

describe('composer store: data editing + breakpoints', () => {
  it('writes base data by default', () => {
    const store = createComposerStore(base())
    store.addElement('mech:frame')
    const id = store.selectedId!
    store.setData(id, { gap: 24 }, { responsive: true })
    // Base breakpoint → writes straight to data, no $bp layer.
    expect(store.template[0]!.data.gap).toBe(24)
    expect(store.template[0]!.data.$bp).toBeUndefined()
  })

  it('writes responsive edits into the active breakpoint layer', () => {
    const store = createComposerStore(base())
    store.addElement('mech:frame')
    const id = store.selectedId!
    store.setData(id, { direction: 'row' })
    store.breakpoint = 'sm'
    store.setData(id, { direction: 'column' }, { responsive: true })
    const data = store.template[0]!.data
    expect(data.direction).toBe('row')
    expect((data.$bp as Record<string, Record<string, unknown>>).sm!.direction).toBe('column')
  })

  it('effective() cascades the active breakpoint over base', () => {
    const store = createComposerStore(base())
    store.addElement('mech:frame')
    const node = store.selected!
    store.setData(node.id, { gap: 24 })
    store.breakpoint = 'sm'
    store.setData(node.id, { gap: 12 }, { responsive: true })
    expect(store.effective(node, 'gap')).toBe(12)
    store.breakpoint = 'base'
    expect(store.effective(node, 'gap')).toBe(24)
  })

  it('reports and clears overrides', () => {
    const store = createComposerStore(base())
    store.addElement('mech:frame')
    const node = store.selected!
    store.breakpoint = 'md'
    store.setData(node.id, { gap: 8 }, { responsive: true })
    expect(store.isOverridden(node, 'gap')).toBe(true)
    store.clearOverride(node.id, 'gap')
    expect(store.isOverridden(node, 'gap')).toBe(false)
  })

  it('deletes a key when set to undefined (base)', () => {
    const store = createComposerStore(base())
    store.addElement('mech:text')
    const id = store.selectedId!
    store.setData(id, { color: '#111' })
    store.setData(id, { color: undefined })
    expect('color' in store.template[0]!.data).toBe(false)
  })
})

describe('composer store: snapshot / replace', () => {
  it('round-trips through snapshot/replace and drops a stale selection', () => {
    const store = createComposerStore(base())
    store.addElement('mech:text')
    const snap = store.snapshot()
    store.select(store.template[0]!.id)
    store.replace({ id: 'hero', name: 'Hero', template: [] })
    expect(store.template).toHaveLength(0)
    expect(store.selectedId).toBeNull()
    store.replace(snap)
    expect(store.template).toHaveLength(1)
  })

  it('setMeta updates only allowed fields', () => {
    const store = createComposerStore(base())
    store.setMeta({ name: 'Renamed', icon: 'star' })
    expect(store.def.name).toBe('Renamed')
    expect(store.def.icon).toBe('star')
  })
})
