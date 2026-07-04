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

describe('composer store: prop exposure', () => {
  const withText = () => {
    const store = createComposerStore(base())
    store.addElement('mech:text')
    const id = store.selectedId!
    store.setData(id, { content: 'Welcome', tag: 'h1' })
    return { store, id }
  }

  it('exposes a field: binds it, records default + previewData', () => {
    const { store, id } = withText()
    const name = store.exposeProp(id, 'content', { type: 'string', format: 'text' }, 'title')
    expect(name).toBe('title')
    expect(store.template[0]!.data.content).toEqual({ $bind: 'title' })
    expect(store.def.props!.title).toMatchObject({ type: 'string', format: 'text', default: 'Welcome' })
    expect(store.def.previewData!.title).toBe('Welcome')
    expect(store.boundPropOf(id, 'content')).toBe('title')
  })

  it('dedupes prop names', () => {
    const { store, id } = withText()
    store.addElement('mech:text')
    const id2 = store.selectedId!
    store.setData(id2, { content: 'Second' })
    expect(store.exposeProp(id, 'content', { type: 'string' }, 'text')).toBe('text')
    expect(store.exposeProp(id2, 'content', { type: 'string' }, 'text')).toBe('text2')
  })

  it('is a no-op on an already-bound field', () => {
    const { store, id } = withText()
    store.exposeProp(id, 'content', { type: 'string' }, 'title')
    expect(store.exposeProp(id, 'content', { type: 'string' }, 'other')).toBe('title')
    expect(Object.keys(store.def.props!)).toEqual(['title'])
  })

  it('unexposes, restoring the preview value and dropping the prop', () => {
    const { store, id } = withText()
    store.exposeProp(id, 'content', { type: 'string' }, 'title')
    store.unexposeProp('title')
    expect(store.template[0]!.data.content).toBe('Welcome')
    expect(store.def.props!.title).toBeUndefined()
    expect(store.def.previewData!.title).toBeUndefined()
    expect(store.boundPropOf(id, 'content')).toBeNull()
  })

  it('renames a prop everywhere', () => {
    const { store, id } = withText()
    store.exposeProp(id, 'content', { type: 'string' }, 'title')
    expect(store.renameProp('title', 'heading')).toBe(true)
    expect(store.template[0]!.data.content).toEqual({ $bind: 'heading' })
    expect(store.def.props!.heading).toBeDefined()
    expect(store.def.props!.title).toBeUndefined()
    expect(store.def.previewData!.heading).toBe('Welcome')
  })

  it('rejects renaming to a taken or empty name', () => {
    const { store, id } = withText()
    store.exposeProp(id, 'content', { type: 'string' }, 'title')
    store.addElement('mech:text')
    const id2 = store.selectedId!
    store.exposeProp(id2, 'content', { type: 'string' }, 'other')
    expect(store.renameProp('title', 'other')).toBe(false)
    expect(store.renameProp('title', '!!!')).toBe(false)
    expect(store.def.props!.title).toBeDefined()
  })

  it('updates a prop default via setPropDefault', () => {
    const { store, id } = withText()
    store.exposeProp(id, 'content', { type: 'string' }, 'title')
    store.setPropDefault('title', 'New default')
    expect((store.def.props!.title as Record<string, unknown>).default).toBe('New default')
    expect(store.def.previewData!.title).toBe('New default')
  })

  it('lists props in declared order', () => {
    const { store, id } = withText()
    store.exposeProp(id, 'content', { type: 'string' }, 'a')
    store.addElement('mech:button')
    const bid = store.selectedId!
    store.exposeProp(bid, 'label', { type: 'string' }, 'b')
    expect(store.props.map((p) => p.name)).toEqual(['a', 'b'])
  })
})

describe('composer store: insertNode + absolute', () => {
  it('inserts a pre-built code-block node at the selection', () => {
    const store = createComposerStore(base())
    store.addElement('mech:frame')
    store.insertNode({ id: 'x', blockId: 'badge', data: { text: 'Hi' } })
    // Frame is a container and selected → node goes inside it.
    expect((store.template[0]!.children as { blockId: string }[])[0]!.blockId).toBe('badge')
  })

  it('toggles absolute placement on and off', () => {
    const store = createComposerStore(base())
    store.addElement('mech:text')
    const id = store.selectedId!
    store.setAbsolute(id, true)
    expect(store.template[0]!.data.$abs).toEqual({ anchor: 'top-left', x: 0, y: 0 })
    store.setAbs(id, { anchor: 'center', x: 20 })
    expect(store.template[0]!.data.$abs).toMatchObject({ anchor: 'center', x: 20, y: 0 })
    store.setAbsolute(id, false)
    expect(store.template[0]!.data.$abs).toBeUndefined()
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
