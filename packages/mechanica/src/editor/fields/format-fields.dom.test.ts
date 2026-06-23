import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h } from 'vue'
import FieldControl from './FieldControl.vue'
import { registerBuiltinFieldEditors } from './builtin'
import { clearFieldEditors } from './registry'

beforeEach(() => {
  clearFieldEditors()
  registerBuiltinFieldEditors()
})

function mountField(schema: Record<string, unknown>, initial: unknown, provide: Record<string, unknown> = {}) {
  const state = { value: initial }
  const el = document.createElement('div')
  const app = createApp({
    render: () =>
      h(FieldControl, {
        modelValue: state.value,
        schema,
        'onUpdate:modelValue': (v: unknown) => (state.value = v),
      }),
  })
  for (const [key, val] of Object.entries(provide)) app.provide(key, val)
  app.mount(el)
  return { el, state }
}

describe('formatted field editors', () => {
  it('image: edits the src and exposes upload when an uploader is provided', () => {
    const { el, state } = mountField({ type: 'object', format: 'image' }, { src: '' }, {
      mechFileUploader: async () => ({ src: '/up.png' }),
    })
    const input = el.querySelector('input[type="text"]')! as HTMLInputElement
    input.value = '/a.png'
    input.dispatchEvent(new Event('input'))
    expect(state.value).toEqual({ src: '/a.png' })
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.includes('Upload'))).toBe(true)
  })

  it('smartLink: patches individual fields', () => {
    const { el, state } = mountField({ type: 'object', format: 'smartLink' }, { url: '', title: '' })
    const url = el.querySelector('input[type="text"]')! as HTMLInputElement
    url.value = '/pricing'
    url.dispatchEvent(new Event('input'))
    expect(state.value).toMatchObject({ url: '/pricing' })
  })

  it('multiselect: adds a tag on Enter', () => {
    const { el, state } = mountField({ type: 'array', format: 'multiselect' }, [])
    const input = el.querySelector('input')! as HTMLInputElement
    input.value = 'alpha'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(state.value).toEqual(['alpha'])
  })

  it('richText: mounts the vuewrite editor', () => {
    const { el } = mountField({ type: 'array', format: 'richText' }, [{ text: 'hello' }])
    expect(el.querySelector('.mech-richtext')).not.toBeNull()
  })
})
