import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h } from 'vue'
import FieldControl from '@/editor/fields/FieldControl.vue'
import { registerBuiltinFieldEditors } from '@/editor/fields/builtin'
import { clearFieldEditors } from '@/editor/fields/registry'

beforeEach(() => {
  clearFieldEditors()
  registerBuiltinFieldEditors()
})

function mountField(schema: Record<string, unknown>, initial: unknown) {
  const state = { value: initial }
  const el = document.createElement('div')
  createApp({
    render: () =>
      h(FieldControl, {
        modelValue: state.value,
        schema,
        'onUpdate:modelValue': (v: unknown) => (state.value = v),
      }),
  }).mount(el)
  return { el, state }
}

describe('FieldControl', () => {
  it('renders a labelled string input and emits edits', () => {
    const { el, state } = mountField({ type: 'string', label: 'Title' }, 'hi')
    const input = el.querySelector('input')!
    expect(el.textContent).toContain('Title')
    expect(input.value).toBe('hi')

    input.value = 'bye'
    input.dispatchEvent(new Event('input'))
    expect(state.value).toBe('bye')
  })

  it('renders a number input that emits numbers', () => {
    const { el, state } = mountField({ type: 'number', label: 'Count' }, 1)
    const input = el.querySelector('input')!
    input.value = '42'
    input.dispatchEvent(new Event('input'))
    expect(state.value).toBe(42)
  })

  it('resolves color fields to the color editor', () => {
    const { el } = mountField({ type: 'string', format: 'color' }, '#abcdef')
    expect(el.querySelector('input[type="color"]')).not.toBeNull()
  })

  it('tags a smartLink field with a "SmartLink" chip beside the label', () => {
    const { el } = mountField({ type: 'object', format: 'smartLink', label: 'Secondary' }, { url: '', title: '' })
    expect(el.querySelector('.mech-field__chip')?.textContent).toBe('SmartLink')
  })

  it('does not tag plain fields with a chip', () => {
    const { el } = mountField({ type: 'string', label: 'Title' }, 'hi')
    expect(el.querySelector('.mech-field__chip')).toBeNull()
  })
})
