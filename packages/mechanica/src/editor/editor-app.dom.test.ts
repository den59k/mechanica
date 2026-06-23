import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, nextTick } from 'vue'
import { registerFieldSchemas } from '@mechanica/shared'
import EditorApp from './EditorApp.vue'
import { registerBuiltinFieldEditors } from './fields/builtin'
import { clearFieldEditors } from './fields/registry'

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
    createApp(EditorApp, {
      state: { content: [], data: {} },
      components,
      onChange: (snapshot: { content: unknown[] }) => changes.push(snapshot),
    }).mount(el)

    expect(el.querySelector('.mech-editor')).not.toBeNull()
    expect(el.textContent).toContain('Hero') // palette item

    el.querySelector<HTMLButtonElement>('.mech-palette__item')!.click()
    await nextTick()

    expect(changes.length).toBeGreaterThan(0)
    expect(changes.at(-1)!.content).toHaveLength(1)
  })
})
