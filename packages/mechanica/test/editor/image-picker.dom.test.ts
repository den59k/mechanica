import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import ImagePickerDialog from '@/editor/dialogs/ImagePickerDialog.vue'
import FieldControl from '@/editor/fields/FieldControl.vue'
import { registerBuiltinFieldEditors } from '@/editor/fields/builtin'
import { clearFieldEditors } from '@/editor/fields/registry'
import { dialogKey, createDialogStore } from '@/editor/ui/dialog'

beforeEach(() => {
  clearFieldEditors()
  registerBuiltinFieldEditors()
})

/** Flush microtasks + a macrotask so onMounted fetches and async handlers settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve))

describe('image picker', () => {
  it('the image field opens the picker and applies its selection', () => {
    const state: { value: { src: string; previewSrc?: string } } = { value: { src: '' } }
    const dialog = createDialogStore()
    const el = document.createElement('div')
    const app = createApp({
      render: () =>
        h(FieldControl, {
          modelValue: state.value,
          schema: { type: 'object', format: 'image' },
          'onUpdate:modelValue': (v: { src: string }) => (state.value = v),
        }),
    })
    app.provide(dialogKey, dialog)
    app.mount(el)

    // Empty field → a drop zone; clicking it pushes the picker onto the stack.
    el.querySelector<HTMLButtonElement>('.mech-image__dropzone')!.click()
    expect(dialog.stack).toHaveLength(1)

    // Selecting in the picker (clicking a library image) flows back into the field.
    const onSelect = dialog.stack[0]!.props!.onSelect as (v: { src: string }) => void
    onSelect({ src: '/a.png' })
    expect(state.value).toEqual({ src: '/a.png' })

    app.unmount()
  })

  it('the dialog lists project images and selecting one calls onSelect', async () => {
    const picked: { src: string }[] = []
    const el = document.createElement('div')
    const app = createApp({
      render: () => h(ImagePickerDialog, { onSelect: (v: { src: string }) => picked.push(v) }),
    })
    app.provide(dialogKey, createDialogStore())
    app.provide('mechImageLibrary', async () => [{ id: 'a', name: 'a.png', src: '/a.png' }])
    app.mount(el)

    await flush()
    await nextTick()

    const items = el.querySelectorAll('.mech-image-picker__item')
    expect(items).toHaveLength(1)
    ;(items[0] as HTMLButtonElement).click()
    expect(picked.at(-1)).toEqual({ src: '/a.png' })

    app.unmount()
  })

  it('the dialog uploads a picked file and selects it', async () => {
    const picked: { src: string }[] = []
    const el = document.createElement('div')
    const app = createApp({
      render: () => h(ImagePickerDialog, { onSelect: (v: { src: string }) => picked.push(v) }),
    })
    app.provide(dialogKey, createDialogStore())
    app.provide('mechImageLibrary', async () => [])
    app.provide('mechFileUploader', async (file: File) => ({ src: `/up/${file.name}` }))
    app.mount(el)
    await flush()

    const input = el.querySelector<HTMLInputElement>('.mech-image-picker__file')!
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'hero.png', { type: 'image/png' })] })
    input.dispatchEvent(new Event('change'))
    await flush()

    expect(picked.at(-1)).toEqual({ src: '/up/hero.png', previewSrc: '/up/hero.png' })

    app.unmount()
  })
})
