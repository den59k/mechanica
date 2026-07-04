import { describe, it, expect, beforeEach } from 'vitest'
import type { ComposedBlockDefinition, ContentBlock } from 'mechanica-shared'
import { createComposerStore } from '@/editor/composer/lib/composer-store'
import { INSERT_ITEMS } from '@/editor/composer/lib/elements-meta'
import { clearClipboard } from '@/editor/composer/lib/clipboard'
import { findBlock } from '@/editor/lib/content-tree'

const base = (): ComposedBlockDefinition => ({ id: 'hero', name: 'Hero', template: [] })
const item = (key: string) => INSERT_ITEMS.find((i) => i.key === key)!
const rootChildren = (store: ReturnType<typeof createComposerStore>) =>
  (store.rootFrame.children as ContentBlock[]) ?? []
const findFrameChildIds = (store: ReturnType<typeof createComposerStore>, frameId: string) => {
  const frame = findBlock(store.template, frameId)
  return frame && Array.isArray(frame.children) ? frame.children.map((c) => c.id) : []
}

describe('composer store: root-frame invariant', () => {
  it('wraps an empty definition in a single root frame', () => {
    const store = createComposerStore(base())
    expect(store.template).toHaveLength(1)
    expect(store.rootFrame.blockId).toBe('mech:frame')
    expect(store.rootId).toBe(store.template[0]!.id)
    expect(store.selectedId).toBeNull()
  })

  it('protects the root from remove / duplicate / relocate', () => {
    const store = createComposerStore(base())
    store.insertItem(item('text'))
    const rootId = store.rootId
    store.remove(rootId)
    expect(store.template).toHaveLength(1)
    store.duplicate(rootId)
    expect(store.template).toHaveLength(1)
    store.relocate(rootId, { anchorId: null, position: 'after' })
    expect(store.template).toHaveLength(1)
  })

  it('walks selection up with selectUp: child → parent → root → none', () => {
    const store = createComposerStore(base())
    store.insertItem(item('column')) // frame child of root, selected
    const frameId = store.selectedId!
    store.insertItem(item('text')) // text child of the frame, selected
    const textId = store.selectedId!
    expect(store.selectedId).toBe(textId)
    store.selectUp()
    expect(store.selectedId).toBe(frameId)
    store.selectUp()
    expect(store.selectedId).toBe(store.rootId)
    store.selectUp()
    expect(store.selectedId).toBeNull()
  })
})

describe('composer store: inserting elements', () => {
  it('inserts into the root when nothing is selected', () => {
    const store = createComposerStore(base())
    store.insertItem(item('column'))
    expect(rootChildren(store)).toHaveLength(1)
    expect(rootChildren(store)[0]!.blockId).toBe('mech:frame')
    expect(store.selectedId).toBe(rootChildren(store)[0]!.id)
  })

  it('adds inside a selected frame (container)', () => {
    const store = createComposerStore(base())
    store.insertItem(item('column'))
    store.insertItem(item('text'))
    const frame = rootChildren(store)[0]!
    expect((frame.children as ContentBlock[])).toHaveLength(1)
    expect((frame.children as { blockId: string }[])[0]!.blockId).toBe('mech:text')
  })

  it('adds after a selected leaf in the same parent', () => {
    const store = createComposerStore(base())
    store.insertItem(item('text'))
    store.insertItem(item('image'))
    expect(rootChildren(store).map((n) => n.blockId)).toEqual(['mech:text', 'mech:image'])
  })

  it('insertAt coerces a root/empty drop to inside-root (never a second root)', () => {
    const store = createComposerStore(base())
    store.insertAt({ id: 'a', blockId: 'mech:text', data: {} }, { anchorId: null, position: 'after' })
    store.insertAt({ id: 'b', blockId: 'mech:text', data: {} }, { anchorId: store.rootId, position: 'before' })
    expect(store.template).toHaveLength(1)
    expect(rootChildren(store).map((n) => n.id)).toEqual(['a', 'b'])
  })
})

describe('composer store: tree ops', () => {
  it('removes, clearing selection', () => {
    const store = createComposerStore(base())
    store.insertItem(item('text'))
    const id = store.selectedId!
    store.remove(id)
    expect(rootChildren(store)).toHaveLength(0)
    expect(store.selectedId).toBeNull()
  })

  it('duplicates and selects the copy', () => {
    const store = createComposerStore(base())
    store.insertItem(item('text'))
    const id = store.selectedId!
    store.duplicate(id)
    expect(rootChildren(store)).toHaveLength(2)
    expect(store.selectedId).not.toBe(id)
  })

  it('moves within the sibling list', () => {
    const store = createComposerStore(base())
    store.insertItem(item('text'))
    store.insertItem(item('image'))
    const imageId = rootChildren(store)[1]!.id
    store.move(imageId, -1)
    expect(rootChildren(store).map((n) => n.blockId)).toEqual(['mech:image', 'mech:text'])
  })
})

describe('composer store: multi-selection', () => {
  const withThree = () => {
    const store = createComposerStore(base())
    store.insertItem(item('text'))
    const a = store.selectedId!
    store.insertItem(item('image'))
    const b = store.selectedId!
    store.insertItem(item('text'))
    const c = store.selectedId!
    return { store, a, b, c }
  }

  it('replaces selection on a plain select, toggles when additive', () => {
    const { store, a, b, c } = withThree()
    store.select(a)
    expect(store.selectedIds).toEqual([a])
    store.select(b, true) // add
    store.select(c, true) // add
    expect(store.selectedIds).toEqual([a, b, c])
    expect(store.selectedId).toBe(c) // last is primary
    store.select(b, true) // toggle off
    expect(store.selectedIds).toEqual([a, c])
    store.select(a) // plain select replaces
    expect(store.selectedIds).toEqual([a])
  })

  it('selectMany replaces; isSelected + selectedNodes reflect the set', () => {
    const { store, a, c } = withThree()
    store.selectMany([a, c])
    expect(store.isSelected(a)).toBe(true)
    expect(store.isSelected(c)).toBe(true)
    expect(store.selectedNodes.map((n) => n.id)).toEqual([a, c])
  })

  it('selectUp narrows a multi-selection to the primary before climbing', () => {
    const { store, a, b, c } = withThree()
    store.selectMany([a, b, c])
    store.selectUp() // collapse to primary
    expect(store.selectedIds).toEqual([c])
    store.selectUp() // climb to root (c is a root child)
    expect(store.selectedId).toBe(store.rootId)
  })

  it('removeSelected deletes every selected element (never the root)', () => {
    const { store, a, b } = withThree()
    store.selectMany([a, b, store.rootId])
    store.removeSelected()
    expect(rootChildren(store)).toHaveLength(1) // only the 3rd text remains
    expect(store.selectedIds).toEqual([])
    expect(store.template).toHaveLength(1) // root survived
  })

  it('duplicateSelected copies each and selects the copies', () => {
    const { store, a, b } = withThree()
    store.selectMany([a, b])
    store.duplicateSelected()
    expect(rootChildren(store)).toHaveLength(5)
    expect(store.selectedIds).toHaveLength(2)
    expect(store.selectedIds).not.toContain(a)
    expect(store.selectedIds).not.toContain(b)
  })

  it('groups a sibling selection into a new frame, in document order', () => {
    const { store, a, b, c } = withThree() // [text a, image b, text c] under root
    store.selectMany([a, c]) // non-contiguous
    expect(store.canGroup).toBe(true)
    store.group()
    // Root now holds [frame, image b] (frame took a's slot), frame wraps [a, c].
    const kids = rootChildren(store)
    expect(kids).toHaveLength(2)
    const frame = kids.find((n) => n.blockId === 'mech:frame')!
    expect(frame).toBeTruthy()
    expect((frame.children as ContentBlock[]).map((n) => n.id)).toEqual([a, c])
    expect(store.selectedIds).toEqual([frame.id]) // the frame is selected
    expect(store.canUngroup).toBe(true)
  })

  it('inherits the parent flow direction when grouping', () => {
    const store = createComposerStore(base())
    store.setData(store.rootId, { direction: 'row' })
    store.insertItem(item('text'))
    const a = store.selectedId!
    store.insertItem(item('text'))
    const b = store.selectedId!
    store.selectMany([a, b])
    store.group()
    const frame = rootChildren(store).find((n) => n.blockId === 'mech:frame')!
    expect(frame.data.direction).toBe('row')
  })

  it('refuses to group elements from different parents', () => {
    const store = createComposerStore(base())
    store.insertItem(item('column')) // a frame under root
    const frameId = store.selectedId!
    store.insertItem(item('text')) // text INSIDE the frame
    const inner = store.selectedId!
    store.select(null)
    store.insertItem(item('image')) // image under root (nothing selected → root)
    const outer = store.selectedId!
    store.selectMany([inner, outer]) // different parents
    expect(store.canGroup).toBe(false)
    store.group()
    expect(findFrameChildIds(store, frameId)).toEqual([inner]) // unchanged
  })

  it('ungroups a frame, lifting its children into the parent and selecting them', () => {
    const { store, a, c } = withThree()
    store.selectMany([a, c])
    store.group()
    const frameId = store.selectedId!
    store.ungroup()
    expect(rootChildren(store).some((n) => n.id === frameId)).toBe(false) // frame gone
    expect(rootChildren(store).map((n) => n.id)).toContain(a)
    expect(rootChildren(store).map((n) => n.id)).toContain(c)
    expect(store.selectedIds).toEqual([a, c]) // children selected
  })
})

describe('composer store: clipboard (copy / cut / paste)', () => {
  beforeEach(() => clearClipboard())

  const withThree = () => {
    const store = createComposerStore(base())
    store.insertItem(item('text'))
    const a = store.selectedId!
    store.insertItem(item('image'))
    const b = store.selectedId!
    store.insertItem(item('text'))
    const c = store.selectedId!
    return { store, a, b, c }
  }

  it('pastes a copy with fresh ids after the selected leaf', () => {
    const { store, a } = withThree()
    store.select(a) // the first text
    store.copySelection()
    store.paste()
    const kids = rootChildren(store)
    expect(kids).toHaveLength(4) // text, [pasted text], image, text
    expect(kids[1]!.blockId).toBe('mech:text')
    expect(kids[1]!.id).not.toBe(a) // fresh id
    expect(store.selectedIds).toEqual([kids[1]!.id]) // the paste is selected
  })

  it('pastes multiple copies preserving order', () => {
    const { store, a, c } = withThree()
    store.selectMany([a, c])
    store.copySelection()
    store.select(c) // paste after the last text
    store.paste()
    // c, [text-copy, text-copy], plus the originals → 5 children total
    expect(rootChildren(store)).toHaveLength(5)
    expect(store.selectedIds).toHaveLength(2)
  })

  it('pastes inside a selected container frame', () => {
    const { store, a } = withThree()
    store.select(a)
    store.copySelection()
    store.insertItem(item('column')) // a frame under root, selected
    const frameId = store.selectedId!
    store.select(frameId)
    store.paste()
    const frame = findBlock(store.template, frameId)!
    expect((frame.children as ContentBlock[]).map((n) => n.blockId)).toEqual(['mech:text'])
  })

  it('cut removes the original but keeps it pasteable', () => {
    const { store, a } = withThree()
    store.select(a)
    store.cutSelection()
    expect(rootChildren(store)).toHaveLength(2) // a removed
    expect(store.selectedIds).toEqual([])
    store.paste() // into root (nothing selected)
    expect(rootChildren(store)).toHaveLength(3)
  })

  it('copySelection ignores the root; paste is a no-op with an empty clipboard', () => {
    const { store } = withThree()
    store.select(store.rootId)
    store.copySelection() // root can't be copied → clipboard stays empty
    const before = rootChildren(store).length
    store.paste()
    expect(rootChildren(store)).toHaveLength(before) // nothing pasted
  })
})

describe('composer store: data editing + breakpoints', () => {
  const withFrame = () => {
    const store = createComposerStore(base())
    store.insertItem(item('column'))
    return { store, id: store.selectedId! }
  }

  it('writes base data by default', () => {
    const { store, id } = withFrame()
    store.setData(id, { gap: 24 }, { responsive: true })
    const frame = rootChildren(store)[0]!
    expect(frame.data.gap).toBe(24)
    expect(frame.data.$bp).toBeUndefined()
  })

  it('writes responsive edits into the active breakpoint layer', () => {
    const { store, id } = withFrame()
    store.setData(id, { direction: 'row' })
    store.breakpoint = 'sm'
    store.setData(id, { direction: 'column' }, { responsive: true })
    const data = rootChildren(store)[0]!.data
    expect(data.direction).toBe('row')
    expect((data.$bp as Record<string, Record<string, unknown>>).sm!.direction).toBe('column')
  })

  it('effective() cascades the active breakpoint over base', () => {
    const { store, id } = withFrame()
    const node = store.selected!
    store.setData(id, { gap: 24 })
    store.breakpoint = 'sm'
    store.setData(id, { gap: 12 }, { responsive: true })
    expect(store.effective(node, 'gap')).toBe(12)
    store.breakpoint = 'base'
    expect(store.effective(node, 'gap')).toBe(24)
  })

  it('reports and clears overrides', () => {
    const { store, id } = withFrame()
    const node = store.selected!
    store.breakpoint = 'md'
    store.setData(id, { gap: 8 }, { responsive: true })
    expect(store.isOverridden(node, 'gap')).toBe(true)
    store.clearOverride(id, 'gap')
    expect(store.isOverridden(node, 'gap')).toBe(false)
  })

  it('deletes a key when set to undefined (base)', () => {
    const store = createComposerStore(base())
    store.insertItem(item('text'))
    const id = store.selectedId!
    store.setData(id, { color: '#111' })
    store.setData(id, { color: undefined })
    expect('color' in rootChildren(store)[0]!.data).toBe(false)
  })
})

describe('composer store: prop exposure', () => {
  const withText = () => {
    const store = createComposerStore(base())
    store.insertItem(item('text'))
    const id = store.selectedId!
    store.setData(id, { content: 'Welcome', tag: 'h1' })
    return { store, id }
  }

  it('exposes a field: binds it, records default + previewData', () => {
    const { store, id } = withText()
    const name = store.exposeProp(id, 'content', { type: 'string', format: 'text' }, 'title')
    expect(name).toBe('title')
    const text = (store.rootFrame.children as ContentBlock[])[0]!
    expect(text.data.content).toEqual({ $bind: 'title' })
    expect(store.def.props!.title).toMatchObject({ type: 'string', format: 'text', default: 'Welcome' })
    expect(store.def.previewData!.title).toBe('Welcome')
    expect(store.boundPropOf(id, 'content')).toBe('title')
  })

  it('dedupes prop names', () => {
    const { store, id } = withText()
    store.insertItem(item('text'))
    const id2 = store.selectedId!
    store.setData(id2, { content: 'Second' })
    expect(store.exposeProp(id, 'content', { type: 'string' }, 'text')).toBe('text')
    expect(store.exposeProp(id2, 'content', { type: 'string' }, 'text')).toBe('text2')
  })

  it('unexposes, restoring the preview value and dropping the prop', () => {
    const { store, id } = withText()
    store.exposeProp(id, 'content', { type: 'string' }, 'title')
    store.unexposeProp('title')
    expect((store.rootFrame.children as ContentBlock[])[0]!.data.content).toBe('Welcome')
    expect(store.def.props!.title).toBeUndefined()
    expect(store.boundPropOf(id, 'content')).toBeNull()
  })

  it('renames a prop everywhere', () => {
    const { store, id } = withText()
    store.exposeProp(id, 'content', { type: 'string' }, 'title')
    expect(store.renameProp('title', 'heading')).toBe(true)
    expect((store.rootFrame.children as ContentBlock[])[0]!.data.content).toEqual({ $bind: 'heading' })
    expect(store.def.props!.heading).toBeDefined()
    expect(store.def.props!.title).toBeUndefined()
  })

  it('updates a prop default via setPropDefault', () => {
    const { store, id } = withText()
    store.exposeProp(id, 'content', { type: 'string' }, 'title')
    store.setPropDefault('title', 'New default')
    expect((store.def.props!.title as Record<string, unknown>).default).toBe('New default')
    expect(store.def.previewData!.title).toBe('New default')
  })
})

describe('composer store: insertNode + absolute', () => {
  it('inserts a pre-built component node inside a selected frame', () => {
    const store = createComposerStore(base())
    store.insertItem(item('column'))
    store.insertNode({ id: 'x', blockId: 'badge', data: { text: 'Hi' } })
    const frame = rootChildren(store)[0]!
    expect((frame.children as { blockId: string }[])[0]!.blockId).toBe('badge')
  })

  it('toggles absolute placement on and off', () => {
    const store = createComposerStore(base())
    store.insertItem(item('text'))
    const id = store.selectedId!
    store.setAbsolute(id, true)
    expect((store.rootFrame.children as ContentBlock[])[0]!.data.$abs).toEqual({ anchor: 'top-left', x: 0, y: 0 })
    store.setAbs(id, { anchor: 'center', x: 20 })
    expect((store.rootFrame.children as ContentBlock[])[0]!.data.$abs).toMatchObject({ anchor: 'center', x: 20, y: 0 })
    store.setAbsolute(id, false)
    expect((store.rootFrame.children as ContentBlock[])[0]!.data.$abs).toBeUndefined()
  })
})

describe('composer store: optional properties (addProp / removeProp / hasProp)', () => {
  const withText = () => {
    const store = createComposerStore(base())
    store.insertItem(item('text'))
    return { store, id: store.selectedId!, node: () => rootChildren(store)[0]! }
  }

  it('hasProp is true when the data already carries the key', () => {
    const { store } = withText()
    expect(store.hasProp(store.rootFrame, 'padding')).toBe(true) // root seeds padding
    expect(store.hasProp(store.rootFrame, 'background')).toBe(false)
  })

  it('addProp shows the row without writing data; the first edit writes it', () => {
    const { store, id, node } = withText()
    store.addProp(id, 'margin')
    expect(store.hasProp(node(), 'margin')).toBe(true)
    expect('margin' in node().data).toBe(false) // view state only, .block.yml untouched
    store.setData(id, { margin: [8, 0] })
    expect(node().data.margin).toEqual([8, 0])
  })

  it('addProp(position) writes $abs immediately — being on *is* data', () => {
    const { store, id, node } = withText()
    store.addProp(id, 'position')
    expect(node().data.$abs).toEqual({ anchor: 'top-left', x: 0, y: 0 })
    expect(store.hasProp(node(), 'position')).toBe(true)
  })

  it('removeProp deletes the key from the base and every $bp layer', () => {
    const { store, id, node } = withText()
    store.setData(id, { margin: 16 })
    store.breakpoint = 'sm'
    store.setData(id, { margin: 8 }, { responsive: true })
    store.breakpoint = 'base'
    store.removeProp(id, 'margin')
    expect('margin' in node().data).toBe(false)
    expect((node().data.$bp as Record<string, Record<string, unknown>>).sm!.margin).toBeUndefined()
    expect(store.hasProp(node(), 'margin')).toBe(false)
  })

  it('removeProp(position) drops $abs and clears the session-added flag', () => {
    const { store, id, node } = withText()
    store.addProp(id, 'position')
    store.removeProp(id, 'position')
    expect(node().data.$abs).toBeUndefined()
    expect(store.hasProp(node(), 'position')).toBe(false)
  })
})

describe('composer store: snapshot / replace', () => {
  it('normalizes on replace and drops a stale selection', () => {
    const store = createComposerStore(base())
    store.insertItem(item('text'))
    store.select(store.selectedId)
    store.replace({ id: 'hero', name: 'Hero', template: [] })
    expect(store.template).toHaveLength(1) // still a root frame
    expect(rootChildren(store)).toHaveLength(0)
    expect(store.selectedId).toBeNull()
  })

  it('setMeta updates only allowed fields', () => {
    const store = createComposerStore(base())
    store.setMeta({ name: 'Renamed', icon: 'star' })
    expect(store.def.name).toBe('Renamed')
    expect(store.def.icon).toBe('star')
  })
})
