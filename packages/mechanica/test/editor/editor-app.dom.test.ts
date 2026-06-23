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
})
