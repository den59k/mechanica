import { describe, it, expect } from 'vitest'
import { registerFieldSchemas } from 'mechanica-shared'
import { createEditorStore } from '@/editor/lib/store'

registerFieldSchemas(() => {})

const components = [
  { blockId: 'hero', __name: 'Hero', blockSchema: { name: 'Hero', props: { title: 'string' } } },
  { blockId: 'not-found', __name: 'NotFound', blockSchema: { name: 'Not found page', page: true, props: { title: 'string' } } },
  { blockId: 'shell', __name: 'Shell', blockSchema: { name: 'Docs shell', page: true, slots: { default: true } } },
]

const placed = (blockId: string, id = `id-${blockId}`) => ({ id, blockId, data: {} })
const templatePage = (blockId = 'not-found') =>
  createEditorStore({ content: [placed(blockId, 'root')], data: {} }, components)

describe('template page (a single page: true root block)', () => {
  it('is detected from the content alone', () => {
    expect(templatePage().pageBlock?.id).toBe('root')
    expect(createEditorStore({ content: [], data: {} }, components).pageBlock).toBeNull()
    expect(createEditorStore({ content: [placed('hero')], data: {} }, components).pageBlock).toBeNull()
    // A template block among other blocks is an ordinary block.
    const mixed = createEditorStore({ content: [placed('not-found'), placed('hero')], data: {} }, components)
    expect(mixed.pageBlock).toBeNull()
  })

  it('shows the template props as the settings target without selecting it', () => {
    const store = templatePage()
    expect(store.selectedId).toBeNull()
    expect(store.selected?.id).toBe('root')
    expect(store.selectedSchema?.properties.title).toBeDefined()

    store.select('root')
    expect(store.selectedId).toBeNull()
    store.setHover('root')
    expect(store.hoverId).toBeNull()
  })

  it('refuses to remove, cut, duplicate or move the template block', () => {
    const store = templatePage()
    store.remove('root')
    store.cut('root')
    store.duplicate('root')
    store.move('root', 1)
    expect(store.content.map((b) => b.id)).toEqual(['root'])
    expect(store.canPaste).toBe(false)
  })

  it('refuses to place anything beside the template block', () => {
    const store = templatePage()
    store.addBlock('hero')
    store.addBlockAt('hero', { anchorId: null, position: 'after' })
    store.addBlockAt('hero', { anchorId: 'root', position: 'before' })
    store.addBlockAt('hero', { anchorId: 'root', position: 'after' })
    expect(store.content).toHaveLength(1)
    expect(store.pageBlock?.id).toBe('root')
  })

  it('keeps blocks inside a template slot ordinary', () => {
    const store = templatePage('shell')

    // With slots the template stays selectable (its props sit next to its
    // children), and nothing is shown until it is selected.
    expect(store.selected).toBeNull()
    store.select('root')
    expect(store.selectedId).toBe('root')
    store.remove('root')
    expect(store.content).toHaveLength(1)

    // No target: the block lands in the template's first slot.
    store.addBlock('hero')
    const hero = (store.content[0]!.children as { id: string }[])[0]!
    expect(store.content).toHaveLength(1)
    expect(store.selectedId).toBe(hero.id)
    expect(store.selected?.blockId).toBe('hero')

    // It cannot be dragged out beside the template…
    store.relocate(hero.id, { anchorId: 'root', position: 'after' })
    expect(store.content).toHaveLength(1)

    // …but copy, paste, duplicate and remove work inside it.
    store.copy(hero.id)
    store.paste(hero.id)
    store.duplicate(hero.id)
    expect(store.content[0]!.children).toHaveLength(3)
    store.select(null)
    store.paste(null)
    expect(store.content[0]!.children).toHaveLength(4)
    store.remove(hero.id)
    expect(store.content[0]!.children).toHaveLength(3)
    expect(store.content).toHaveLength(1)
  })

  it('drops a selection that became the page', () => {
    const store = createEditorStore({ content: [placed('not-found', 'root'), placed('hero', 'h')], data: {} }, components)
    store.select('root')
    expect(store.selectedId).toBe('root')
    store.remove('h')
    expect(store.selectedId).toBeNull()
    expect(store.selected?.id).toBe('root')
  })
})
