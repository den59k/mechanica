import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, nextTick } from 'vue'
import { registerFieldSchemas } from '@mechanica/shared'
import EditorApp from '@/editor/EditorApp.vue'
import { registerBuiltinFieldEditors } from '@/editor/fields/builtin'
import { clearFieldEditors } from '@/editor/fields/registry'

beforeEach(() => {
  clearFieldEditors()
  registerBuiltinFieldEditors()
  registerFieldSchemas(() => {})
})

const components = [
  { blockId: 'hero', __name: 'Hero', blockSchema: { name: 'Hero', category: 'Content', props: { title: 'string' } } },
]

describe('EditorApp', () => {
  it('renders the panels and reports edits', async () => {
    const changes: { content: unknown[] }[] = []
    const el = document.createElement('div')
    const app = createApp(EditorApp, {
      state: { content: [], data: {} },
      components,
      onChange: (snapshot: { content: unknown[] }) => changes.push(snapshot),
    })
    app.mount(el)

    expect(el.querySelector('.mech-editor')).not.toBeNull()
    expect(el.textContent).toContain('Hero') // palette item

    // Tap the palette item (pointerdown + release without moving).
    const item = el.querySelector('.mech-palette__item')!
    const down = new Event('pointerdown', { bubbles: true })
    Object.assign(down, { clientX: 0, clientY: 0 })
    item.dispatchEvent(down)
    const up = new Event('pointerup')
    Object.assign(up, { clientX: 0, clientY: 0 })
    window.dispatchEvent(up)
    await nextTick()

    expect(changes.length).toBeGreaterThan(0)
    expect(changes.at(-1)!.content).toHaveLength(1)

    app.unmount() // stops the block-frame rAF loop + listeners
  })

  it('opens a Page data dialog and edits a data entry', async () => {
    const changes: { data: Record<string, unknown> }[] = []
    const el = document.createElement('div')
    const app = createApp(EditorApp, {
      state: { content: [], data: {} },
      components,
      dataEntries: [
        { id: 'site', title: 'Site', scope: 'site', props: { type: 'object', properties: { name: { type: 'string' } } } },
      ],
      onChange: (snapshot: { data: Record<string, unknown> }) => changes.push(snapshot),
    })
    app.mount(el)

    const launcher = el.querySelector('.mech-editor__data')!
    expect(launcher).toBeTruthy()
    launcher.dispatchEvent(new Event('click', { bubbles: true }))
    await nextTick()

    // The dialog is teleported to <body>, so query the document, not `el`.
    const input = document.querySelector('.mech-data input') as HTMLInputElement
    expect(input).toBeTruthy()
    input.value = 'Acme'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(changes.at(-1)!.data).toMatchObject({ site: { name: 'Acme' } })

    app.unmount()
  })

  it('wires image fields to the upload + library pickers', async () => {
    const el = document.createElement('div')
    const app = createApp(EditorApp, {
      state: { content: [], data: {} },
      components: [
        {
          blockId: 'banner',
          __name: 'Banner',
          blockSchema: {
            name: 'Banner',
            category: 'Media',
            props: {
              image: { type: 'object', format: 'image', properties: { src: 'string', previewSrc: 'string?' } },
            },
          },
        },
      ],
      uploadFile: async (file: File) => ({ src: `/up/${file.name}` }),
      listImages: async () => [{ id: 'a', name: 'a.png', src: '/a.png' }],
    })
    app.mount(el)

    // Tap the Banner palette item → adds + selects it → the settings panel opens.
    const item = el.querySelector('.mech-palette__item')!
    const down = new Event('pointerdown', { bubbles: true })
    Object.assign(down, { clientX: 0, clientY: 0 })
    item.dispatchEvent(down)
    const up = new Event('pointerup')
    Object.assign(up, { clientX: 0, clientY: 0 })
    window.dispatchEvent(up)
    await nextTick()

    // The empty image field shows a drop zone instead of a URL input.
    const dropzone = el.querySelector('.mech-image__dropzone') as HTMLButtonElement
    expect(dropzone).toBeTruthy()

    // Opening it surfaces the picker (teleported to <body>) listing project images,
    // proving both uploadFile + listImages flow through EditorApp's provides.
    dropzone.click()
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve))
    await nextTick()
    expect(document.querySelector('.mech-image-picker__item')).toBeTruthy()

    app.unmount()
  })

  it('hides the data launcher when no entries are declared', () => {
    const el = document.createElement('div')
    const app = createApp(EditorApp, { state: { content: [], data: {} }, components })
    app.mount(el)
    expect(el.querySelector('.mech-editor__data')).toBeNull()
    app.unmount()
  })
})
