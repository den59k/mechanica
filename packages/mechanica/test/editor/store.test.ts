import { describe, it, expect } from 'vitest'
import { registerFieldSchemas, type DataEntry } from '@mechanica/shared'
import { createEditorStore, compareDataEntries } from '@/editor/lib/store'

registerFieldSchemas(() => {})

const components = [
  { blockId: 'hero', __name: 'Hero', blockSchema: { name: 'Hero', props: { title: 'string' } } },
  { blockId: 'spacer', __name: 'Spacer', blockSchema: { hidden: true } },
  { blockId: 'section', __name: 'Section', blockSchema: { name: 'Section', slots: { default: true } } },
]

const dataEntries: DataEntry[] = [
  { id: 'header', title: 'Header', props: { type: 'object', properties: { logo: { type: 'string' } } } },
  { id: 'seo', title: 'SEO', props: { type: 'object', properties: { title: { type: 'string' } } } },
]

describe('editor store', () => {
  it('exposes visible block metadata only', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    expect(store.blocks.map((b) => b.id)).toEqual(['hero', 'section'])
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

  it('adds a block inside a container via an inside drop', () => {
    const store = createEditorStore({ content: [], data: {} }, components)
    store.addBlock('section')
    const sectionId = store.content[0]!.id
    store.addBlockAt('hero', { anchorId: sectionId, position: 'inside' })
    expect(store.content).toHaveLength(1)
    expect((store.content[0]!.children as Array<{ blockId: string }>)[0]!.blockId).toBe('hero')
  })

  it('exposes data entries sorted by title and seeds a value on first edit', () => {
    const store = createEditorStore({ content: [], data: {} }, components, dataEntries)
    expect(store.dataEntries.map((e) => e.id)).toEqual(['header', 'seo'])
    // A fresh entry defaults to "this page" scope; dataValue seeds it for binding.
    expect(store.dataValue('seo')).toEqual({})
    expect(store.scopeOf('seo')).toBe('page')
  })

  it('reads a value from the scope that holds it', () => {
    const store = createEditorStore(
      { content: [], data: {}, siteData: { header: { logo: 'logo.svg' } } },
      components,
      dataEntries,
    )
    expect(store.scopeOf('header')).toBe('site')
    expect(store.dataValue('header')).toEqual({ logo: 'logo.svg' })
  })

  it('overrides per page and reverts to the site value via setScope', () => {
    const store = createEditorStore(
      { content: [], data: {}, siteData: { header: { logo: 'site.svg' } } },
      components,
      dataEntries,
    )
    expect(store.scopeOf('header')).toBe('site')

    // Override for this page: a page copy is seeded from the site value, site kept.
    store.setScope('header', 'page')
    expect(store.scopeOf('header')).toBe('page')
    ;(store.dataValue('header') as Record<string, unknown>).logo = 'page.svg'
    expect(store.siteData.header).toEqual({ logo: 'site.svg' })
    expect(store.effective.header).toEqual({ logo: 'page.svg' })

    // Back to site: the override is dropped and the existing site value is used.
    store.setScope('header', 'site')
    expect(store.scopeOf('header')).toBe('site')
    expect(store.pageData.header).toBeUndefined()
    expect(store.effective.header).toEqual({ logo: 'site.svg' })
  })

  it('owns its state independently of the passed-in window state', () => {
    // Regression: the runtime mutates window.state in place via the bridge.
    // If the store aliased it, a stale echo could overwrite a field being typed.
    const initial = {
      content: [{ id: 'a', blockId: 'hero', data: { title: 'x' } }],
      data: {},
      siteData: { header: { logo: 'a.svg' } },
    }
    const store = createEditorStore(initial, components, dataEntries)

    // Editing through the store must not leak back into the original state...
    ;(store.dataValue('header') as Record<string, unknown>).logo = 'b.svg'
    store.content[0]!.data.title = 'y'
    expect(initial.siteData.header.logo).toBe('a.svg')
    expect(initial.content[0]!.data.title).toBe('x')

    // ...and a later external mutation of the original must not reach the store.
    initial.siteData.header.logo = 'c.svg'
    expect((store.siteData.header as Record<string, unknown>).logo).toBe('b.svg')
  })
})

describe('compareDataEntries', () => {
  it('orders alphabetically by title (falling back to id)', () => {
    const entries: DataEntry[] = [
      { id: 'b', title: 'Zebra' },
      { id: 'a', title: 'Apple' },
      { id: 'c', title: 'Mango' },
    ]
    expect([...entries].sort(compareDataEntries).map((e) => e.id)).toEqual(['a', 'c', 'b'])
  })
})
