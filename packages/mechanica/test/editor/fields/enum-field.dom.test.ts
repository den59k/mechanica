import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h } from 'vue'
import FieldControl from '@/editor/fields/FieldControl.vue'
import { registerBuiltinFieldEditors } from '@/editor/fields/builtin'
import { clearFieldEditors } from '@/editor/fields/registry'

beforeEach(() => {
  clearFieldEditors()
  registerBuiltinFieldEditors()
  document.body.innerHTML = ''
})

function mountField(schema: Record<string, unknown>, initial: unknown) {
  const state = { value: initial }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () =>
      h(FieldControl, {
        modelValue: state.value,
        schema,
        'onUpdate:modelValue': (v: unknown) => (state.value = v),
      }),
  })
  app.mount(host)
  return { host, state }
}

const flush = () => new Promise((resolve) => setTimeout(resolve))

describe('enum field (dropdown)', () => {
  it('opens on click and lists every enum option', async () => {
    const { host } = mountField({ type: 'string', enum: ['left', 'center', 'right'] }, 'left')
    expect(host.querySelector('.mech-select__trigger')).not.toBeNull()
    expect(document.querySelector('.mech-select__menu')).toBeNull() // closed at rest

    host.querySelector('.mech-select__trigger')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    const options = document.querySelectorAll('.mech-select__option')
    expect([...options].map((o) => o.textContent?.trim())).toEqual(['left', 'center', 'right'])
    // the current value is marked selected
    expect(document.querySelector('.mech-select__option.is-selected')?.textContent?.trim()).toBe('left')
  })

  it('chooses an option, emits it, and closes the menu', async () => {
    const { host, state } = mountField({ type: 'string', enum: ['sm', 'md', 'lg'] }, 'sm')
    host.querySelector('.mech-select__trigger')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    const options = document.querySelectorAll<HTMLElement>('.mech-select__option')
    options[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    expect(state.value).toBe('lg')
    expect(document.querySelector('.mech-select__menu')).toBeNull() // closed after choosing
  })

  it('shows the placeholder when the value is not one of the options', () => {
    const { host } = mountField({ type: 'string', enum: ['a', 'b'], placeholder: 'Pick one' }, undefined)
    const trigger = host.querySelector('.mech-select__trigger')!
    expect(trigger.classList.contains('is-placeholder')).toBe(true)
    expect(trigger.textContent?.trim()).toBe('Pick one')
  })
})
