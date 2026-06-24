import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h } from 'vue'
import FieldControl from '@/editor/fields/FieldControl.vue'
import { registerBuiltinFieldEditors } from '@/editor/fields/builtin'
import { clearFieldEditors } from '@/editor/fields/registry'

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
  it('image: an empty field drops a file onto its zone and uploads it', async () => {
    const { el, state } = mountField({ type: 'object', format: 'image' }, { src: '' }, {
      mechFileUploader: async (file: File) => ({ src: `/up/${file.name}` }),
    })
    const dropzone = el.querySelector('.mech-image__dropzone')!
    expect(dropzone).toBeTruthy() // no URL input — a drop zone instead
    const drop = new Event('drop', { bubbles: true })
    Object.assign(drop, { dataTransfer: { files: [new File(['x'], 'pic.png', { type: 'image/png' })] } })
    dropzone.dispatchEvent(drop)
    await new Promise((resolve) => setTimeout(resolve)) // let the uploader resolve
    expect(state.value).toEqual({ src: '/up/pic.png', previewSrc: '/up/pic.png' })
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
