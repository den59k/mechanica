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

    const launcher = [...el.querySelectorAll('.mech-button')].find((b) => b.textContent?.includes('Edit page data'))!
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

  it('edits page settings when no block is selected and reports meta changes', async () => {
    const metas: Array<{ meta?: Record<string, unknown> }> = []
    const el = document.createElement('div')
    const app = createApp(EditorApp, {
      state: { content: [], data: {}, page: { path: '/', meta: { title: 'Home' } } },
      components,
      onMetaChange: (meta: { meta?: Record<string, unknown> }) => metas.push(meta),
    })
    app.mount(el)

    // Nothing selected → the Settings tab shows page settings.
    const settingsTab = [...el.querySelectorAll('.mech-tabs button')].find((b) => b.textContent?.trim() === 'Settings')!
    settingsTab.dispatchEvent(new Event('click', { bubbles: true }))
    await nextTick()

    const input = el.querySelector('.mech-settings input') as HTMLInputElement
    expect(input.value).toBe('Home')
    input.value = 'Home Page'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(metas.at(-1)!.meta).toMatchObject({ title: 'Home Page' })
    app.unmount()
  })

  it('hides the data launcher when no entries are declared', () => {
    const el = document.createElement('div')
    const app = createApp(EditorApp, { state: { content: [], data: {} }, components })
    app.mount(el)
    const labels = [...el.querySelectorAll('.mech-button')].map((b) => b.textContent?.trim())
    expect(labels).not.toContain('Edit page data')
    app.unmount()
  })
})
