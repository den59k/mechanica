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

  it('shows a Data tab and edits a data entry when entries are declared', async () => {
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

    const dataTab = [...el.querySelectorAll('.mech-tabs button')].find((b) => b.textContent?.trim() === 'Data')!
    expect(dataTab).toBeTruthy()
    dataTab.dispatchEvent(new Event('click', { bubbles: true }))
    await nextTick()

    const input = el.querySelector('.mech-data input') as HTMLInputElement
    expect(input).toBeTruthy()
    input.value = 'Acme'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(changes.at(-1)!.data).toMatchObject({ site: { name: 'Acme' } })

    app.unmount()
  })

  it('hides the Data tab when no entries are declared', () => {
    const el = document.createElement('div')
    const app = createApp(EditorApp, { state: { content: [], data: {} }, components })
    app.mount(el)
    const labels = [...el.querySelectorAll('.mech-tabs button')].map((b) => b.textContent?.trim())
    expect(labels).not.toContain('Data')
    app.unmount()
  })
})
