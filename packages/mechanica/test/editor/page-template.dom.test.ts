import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { registerFieldSchemas, type ContentBlock } from 'mechanica-shared'
import { createEditorStore, editorStoreKey, type EditorStore } from '@/editor/lib/store'
import { dragKey, type DragController } from '@/editor/lib/drag-controller'
import { createContextMenu, contextMenuKey } from '@/editor/lib/context-menu'
import { createEditorBackend, setEditorBackend } from '@/editor/lib/backend'
import { registerBuiltinFieldEditors } from '@/editor/fields/builtin'
import { clearFieldEditors } from '@/editor/fields/registry'
import EditorApp from '@/editor/EditorApp.vue'
import HierarchyTree from '@/editor/components/HierarchyTree.vue'

const components = [
  { blockId: 'hero', __name: 'Hero', blockSchema: { name: 'Hero', category: 'Content', props: { title: 'string' } } },
  {
    blockId: 'not-found',
    __name: 'NotFound',
    blockSchema: { name: 'Not found page', page: true, icon: 'frame', props: { title: 'string' } },
  },
  { blockId: 'shell', __name: 'Shell', blockSchema: { name: 'Docs shell', page: true, slots: { default: true } } },
]

const apps: App[] = []
beforeEach(() => {
  clearFieldEditors()
  registerBuiltinFieldEditors()
  registerFieldSchemas(() => {})
})
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount()
  document.body.innerHTML = ''
  setEditorBackend(null)
})

/** Mount the whole editor on a page with this content. */
function mountEditor(content: ContentBlock[]) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(EditorApp, { state: { content, data: {}, page: { path: '/404' } }, components })
  app.mount(el)
  apps.push(app)
  return el
}

/** Put the page's blocks in the document, each with a fixed box. */
function renderBlocks(boxes: Record<string, { top: number; height: number }>) {
  for (const [id, box] of Object.entries(boxes)) {
    const section = document.createElement('section')
    section.setAttribute('data-block-id', id)
    section.innerHTML = `<p id="text-${id}">Some text</p>`
    section.getBoundingClientRect = () => ({ left: 300, width: 800, ...box }) as DOMRect
    document.body.appendChild(section)
  }
}

const click = (element: Element | null) =>
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
const press = (key: string, code?: string) =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }))
/** Let the block-frame loop (requestAnimationFrame) measure the selection. */
const frame = async () => {
  await new Promise((resolve) => setTimeout(resolve, 40))
  await nextTick()
}
/** The settings panel, not counting one sliding out. */
const settingsPanel = (el: Element) =>
  el.querySelector('.mech-editor__panel--settings:not(.mech-slide-right-leave-active)')

describe('a pinned template page (a slotless page template is the whole page)', () => {
  const page = [{ id: 'root', blockId: 'not-found', data: { title: 'Page not found' } }]

  it('shows a note instead of the tree and no palette', () => {
    const el = mountEditor(page)
    const note = el.querySelector('.mech-template-note')!
    expect(note).not.toBeNull()
    expect(note.querySelector('.mech-editor__heading')!.textContent).toBe('Page template')
    expect(note.querySelector('.mech-template-note__label')!.textContent).toBe('Not found page')
    expect(note.querySelector('.mech-template-note__hint')!.textContent).toBe(
      'This page comes from code. Edit its properties on the right.',
    )
    expect(el.querySelector('.mech-tree')).toBeNull()
    expect(el.querySelector('.mech-tree__empty')).toBeNull()
    expect(el.querySelector('.mech-palette')).toBeNull()
    expect(el.querySelector('.mech-editor__panel--right')).toBeNull()
  })

  it('keeps the template props open in the settings panel, with no Close button', () => {
    const el = mountEditor(page)
    const panel = settingsPanel(el)!
    expect(panel).not.toBeNull()
    expect(panel.querySelector('.mech-editor__settings-title')!.textContent).toBe('Not found page')
    expect(panel.querySelector('.mech-editor__settings-head button')).toBeNull()
    expect((panel.querySelector('input') as HTMLInputElement).value).toBe('Page not found')
    // Nothing is selected, so there is no frame or toolbar.
    expect(el.querySelector('.mech-toolbar')).toBeNull()
  })

  it('"Change template" opens the Page data dialog', async () => {
    const el = mountEditor(page)
    expect(el.querySelector('.mech-editor__data')!.getAttribute('title')).toBe(
      "Edit this page's data and setup (layout, page template)",
    )
    const change = el.querySelector('.mech-template-note__action')!
    expect(change.textContent!.trim()).toBe('Change template')
    expect(change.classList.contains('mech-button')).toBe(false) // quiet, not a pill
    click(change)
    await nextTick()
    // The dialog is teleported to <body>.
    expect(document.querySelector('.mech-data')).not.toBeNull()
    expect(document.body.textContent).toContain('Page setup')
  })

  it('offers the composer for a composed template', () => {
    const composed = {
      blockId: 'coming-soon',
      __name: 'ComingSoon',
      blockSchema: { name: 'Coming soon', page: true, composed: true },
    }
    const el = document.createElement('div')
    const app = createApp(EditorApp, {
      state: { content: [{ id: 'root', blockId: 'coming-soon', data: {} }], data: {} },
      components: [...components, composed],
    })
    app.mount(el)
    apps.push(app)
    const note = el.querySelector('.mech-template-note')!
    expect(note.querySelector('.mech-template-note__hint')!.textContent).toBe('This page is designed in the composer.')
    expect([...note.querySelectorAll('.mech-template-note__action')].map((b) => b.textContent!.trim())).toEqual([
      'Change template',
      'Edit in the composer',
    ])
  })

  it('hides the settings panel in comment mode so the threads stay visible', async () => {
    const comments = {
      list: vi.fn(async () => []),
      create: vi.fn(),
      reply: vi.fn(),
      setStatus: vi.fn(),
      remove: vi.fn(),
    }
    setEditorBackend({ ...createEditorBackend(), comments, onCommentsChange: () => () => {} } as never)
    const el = mountEditor(page)
    await frame()
    expect(settingsPanel(el)).not.toBeNull()

    press('c', 'KeyC')
    await nextTick()
    expect(el.querySelector('.mech-comments')).not.toBeNull()
    expect(settingsPanel(el)).toBeNull()
    expect(el.querySelector('.mech-palette')).toBeNull()
    expect(el.querySelector('.mech-template-note')).not.toBeNull()

    press('c', 'KeyC')
    await nextTick()
    // Out of the mode the whole right panel goes (it slides out), not just the threads.
    expect(el.querySelector('.mech-editor__panel--right:not(.mech-slide-right-leave-active)')).toBeNull()
    expect(settingsPanel(el)).not.toBeNull()
    expect(el.querySelector('.mech-palette')).toBeNull()
  })
})

describe('an ordinary page', () => {
  it('keeps the tree, the palette and a closable settings panel', async () => {
    // A page template beside other blocks is just a block.
    const el = mountEditor([
      { id: 'nf', blockId: 'not-found', data: {} },
      { id: 'h', blockId: 'hero', data: {} },
    ])
    expect(el.querySelector('.mech-template-note')).toBeNull()
    expect(el.querySelector('.mech-tree')).not.toBeNull()
    expect(el.querySelector('.mech-palette')).not.toBeNull()
    expect(el.querySelector('.mech-editor__panel--settings')).toBeNull()

    renderBlocks({ nf: { top: 0, height: 300 }, h: { top: 300, height: 300 } })
    click(document.getElementById('text-nf'))
    await frame()
    const panel = settingsPanel(el)!
    expect(panel.querySelector('.mech-editor__settings-title')!.textContent).toBe('Not found page')
    expect(panel.querySelector('.mech-editor__settings-head button[title="Close"]')).not.toBeNull()
    const titles = [...el.querySelectorAll('.mech-toolbar button')].map((b) => b.getAttribute('title'))
    expect(titles).toEqual(['Drag to move', 'Move up', 'Move down', 'Duplicate', 'Save as a reusable block', 'Delete'])
  })
})

describe('a template page with slots', () => {
  const page = () => [
    { id: 'root', blockId: 'shell', data: {}, children: [{ id: 'child', blockId: 'hero', data: {} }] },
  ]

  it('keeps the tree and palette; the root has no toolbar, its children the full one', async () => {
    const el = mountEditor(page())
    expect(el.querySelector('.mech-template-note')).toBeNull()
    expect(el.querySelector('.mech-tree')).not.toBeNull()
    expect(el.querySelector('.mech-palette')).not.toBeNull()

    renderBlocks({ root: { top: 0, height: 600 } })
    document.querySelector('[data-block-id="root"]')!.appendChild(
      Object.assign(document.createElement('section'), { id: 'child-block' }),
    )
    const child = document.getElementById('child-block')!
    child.setAttribute('data-block-id', 'child')
    child.getBoundingClientRect = () => ({ top: 100, left: 300, width: 800, height: 200 }) as DOMRect

    click(document.getElementById('text-root'))
    await frame()
    expect(el.querySelector('.mech-frame--selected')).not.toBeNull()
    expect(el.querySelector('.mech-toolbar')).toBeNull()
    expect(settingsPanel(el)!.querySelector('.mech-editor__settings-head button[title="Close"]')).not.toBeNull()

    click(child)
    await frame()
    const titles = [...el.querySelectorAll('.mech-toolbar button')].map((b) => b.getAttribute('title'))
    expect(titles).toEqual(['Drag to move', 'Move up', 'Move down', 'Duplicate', 'Save as a reusable block', 'Delete'])
  })

  it('keeps "Edit in the composer" for a composed root', async () => {
    const composedShell = {
      blockId: 'shell',
      __name: 'Shell',
      blockSchema: { name: 'Docs shell', page: true, composed: true, slots: { default: true } },
    }
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(EditorApp, {
      state: { content: page(), data: {} },
      components: [components[0], composedShell],
    })
    app.mount(el)
    apps.push(app)
    renderBlocks({ root: { top: 0, height: 600 } })

    click(document.getElementById('text-root'))
    await frame()
    const titles = [...el.querySelectorAll('.mech-toolbar button')].map((b) => b.getAttribute('title'))
    expect(titles).toEqual(['Edit in the composer'])
  })

  describe('in the tree', () => {
    const mountTree = (store: EditorStore) => {
      const drag = { begin: vi.fn(), payload: null, drop: null, container: null } as unknown as DragController
      const menu = createContextMenu()
      const el = document.createElement('div')
      const app = createApp({ render: () => h(HierarchyTree) })
      app.provide(editorStoreKey, store)
      app.provide(dragKey, drag)
      app.provide(contextMenuKey, menu)
      app.mount(el)
      apps.push(app)
      return { el, drag, menu }
    }
    const rightClick = (row: Element) =>
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 20 }))

    it('drops cut, duplicate, move and delete from the root row menu', () => {
      const store = createEditorStore({ content: page(), data: {} }, components)
      const { el, menu } = mountTree(store)

      rightClick(el.querySelector('[data-tree-id="root"]')!)
      expect(store.selectedId).toBe('root')
      expect(menu.items.map((item) => item.label)).toEqual(['Collapse', 'Copy', 'Paste'])

      // A child keeps the full menu.
      rightClick(el.querySelector('[data-tree-id="child"]')!)
      expect(menu.items.map((item) => item.label)).toEqual([
        'Copy',
        'Cut',
        'Paste',
        'Duplicate',
        'Move up',
        'Move down',
        'Delete',
      ])

      // Paste on the root lands inside it, never beside it.
      menu.items.find((item) => item.label === 'Copy')!.onClick!()
      rightClick(el.querySelector('[data-tree-id="root"]')!)
      menu.items.find((item) => item.label === 'Paste')!.onClick!()
      expect(store.content).toHaveLength(1)
      expect(store.content[0]!.children).toHaveLength(2)
    })

    it('selects the root row on press without starting a drag', () => {
      const store = createEditorStore({ content: page(), data: {} }, components)
      const { el, drag } = mountTree(store)
      const down = () => Object.assign(new Event('pointerdown', { bubbles: true }), { clientX: 0, clientY: 0 })

      el.querySelector('[data-tree-id="root"]')!.dispatchEvent(down())
      expect(drag.begin).not.toHaveBeenCalled()
      expect(store.selectedId).toBe('root')

      el.querySelector('[data-tree-id="child"]')!.dispatchEvent(down())
      expect(drag.begin).toHaveBeenCalledTimes(1)
      expect((drag.begin as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({ kind: 'move', id: 'child' })
    })
  })
})
