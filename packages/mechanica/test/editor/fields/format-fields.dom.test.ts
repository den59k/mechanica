import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, h } from 'vue'
import FieldControl from '@/editor/fields/FieldControl.vue'
import { registerBuiltinFieldEditors } from '@/editor/fields/builtin'
import { clearFieldEditors } from '@/editor/fields/registry'
import { stubImageLoading } from '../stub-image'

beforeEach(() => {
  clearFieldEditors()
  registerBuiltinFieldEditors()
  stubImageLoading()
})

afterEach(() => {
  vi.unstubAllGlobals()
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
    // The intrinsic size (stubbed 640×480) is captured alongside the upload.
    expect(state.value).toEqual({ src: '/up/pic.png', previewSrc: '/up/pic.png', width: 640, height: 480 })
  })

  it('image: alt text is editable once an image is chosen', () => {
    const { el, state } = mountField({ type: 'object', format: 'image' }, { src: '/a.png' })
    const alt = el.querySelector('.mech-image__chosen input.mech-input') as HTMLInputElement
    expect(alt).toBeTruthy()
    alt.value = 'A mountain at dusk'
    alt.dispatchEvent(new Event('input'))
    expect(state.value).toEqual({ src: '/a.png', alt: 'A mountain at dusk' })
  })

  it('smartLink: edits the visible title', () => {
    // external links reveal the extra settings (title, new tab) by default.
    const { el, state } = mountField(
      { type: 'object', format: 'smartLink' },
      { url: 'https://x.com', title: '', external: true },
      { mechPages: [] },
    )
    const title = el.querySelector('.mech-smartlink__title input') as HTMLInputElement
    title.value = 'Example'
    title.dispatchEvent(new Event('input'))
    expect(state.value).toMatchObject({ url: 'https://x.com', title: 'Example' })
  })

  it('multiselect: adds a tag on Enter', () => {
    const { el, state } = mountField({ type: 'array', format: 'multiselect' }, [])
    const input = el.querySelector('input')! as HTMLInputElement
    input.value = 'alpha'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(state.value).toEqual(['alpha'])
  })

  it('richText: minimal inline editor has the Markdown switch but no full toolbar', () => {
    const { el } = mountField({ type: 'array', format: 'richText' }, [{ text: 'hello' }])
    expect(el.querySelector('.mech-rte--minimal')).not.toBeNull()
    // The Rich/Markdown toggle is available inline…
    expect(el.querySelector('.mech-rte__switchbar .mech-segmented')).not.toBeNull()
    // …but the block-type dropdown (full toolbar) stays in the dialog.
    expect(el.querySelector('.mech-rte__type')).toBeNull()
  })
})
