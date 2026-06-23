import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h, reactive } from 'vue'
import { registerFieldSchemas } from '@mechanica/shared'
import SchemaForm from './SchemaForm.vue'
import { registerBuiltinFieldEditors } from '../fields/builtin'
import { clearFieldEditors } from '../fields/registry'

beforeEach(() => {
  clearFieldEditors()
  registerBuiltinFieldEditors()
  registerFieldSchemas(() => {})
})

const schema = {
  type: 'object',
  properties: {
    title: { type: 'string', label: 'Title' },
    meta: { type: 'object', properties: { author: { type: 'string' } }, required: ['author'] },
    tags: { type: 'array', items: { type: 'string' } },
  },
}

function mount(data: Record<string, unknown>) {
  const model = reactive(data)
  const el = document.createElement('div')
  createApp({ render: () => h(SchemaForm, { modelValue: model, schema }) }).mount(el)
  return { el, model }
}

describe('SchemaForm', () => {
  it('renders a field per property, recursing into nested objects', () => {
    const { el } = mount({ title: 'Hi', meta: { author: 'A' }, tags: [] })
    expect(el.textContent).toContain('Title')
    expect(el.querySelector('legend')?.textContent).toBe('Meta')
    expect(el.querySelectorAll('input').length).toBeGreaterThanOrEqual(2)
  })

  it('mutates the model when a field changes', () => {
    const { el, model } = mount({ title: 'Hi', meta: { author: 'A' }, tags: [] })
    const input = el.querySelector('input')!
    input.value = 'New title'
    input.dispatchEvent(new Event('input'))
    expect(model.title).toBe('New title')
  })

  it('adds and removes array items', () => {
    const { el, model } = mount({ title: '', meta: { author: '' }, tags: ['a'] })
    const add = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Add'))!
    add.click()
    expect((model.tags as unknown[]).length).toBe(2)

    const remove = el.querySelector<HTMLButtonElement>('.mech-array__remove')!
    remove.click()
    expect((model.tags as unknown[]).length).toBe(1)
  })
})
