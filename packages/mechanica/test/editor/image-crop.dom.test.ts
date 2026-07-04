import { describe, it, expect, afterEach, vi } from 'vitest'
import { createApp, h } from 'vue'
import ImageCropDialog from '@/editor/dialogs/ImageCropDialog.vue'
import { createDialogStore, dialogKey } from '@/editor/ui/dialog'
import type { EditorImageValue } from '@/editor/lib/image-crop'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const flush = () => new Promise((resolve) => setTimeout(resolve))

/** Mount the dialog with a dialog store, a derived uploader, and an onApply sink. */
function mountDialog(props: {
  image: EditorImageValue
  crop?: unknown
  uploader?: (blob: Blob, name: string) => Promise<{ src: string }>
}) {
  const applied: EditorImageValue[] = []
  const dialog = createDialogStore()
  const el = document.createElement('div')
  const app = createApp({
    render: () =>
      h(ImageCropDialog, {
        image: props.image,
        crop: props.crop,
        onApply: (value: EditorImageValue) => applied.push(value),
      }),
  })
  app.provide(dialogKey, dialog)
  app.provide('mechDerivedUploader', props.uploader ?? null)
  app.mount(el)
  return { el, app, applied, dialog }
}

/** A pointer event carrying client coordinates (jsdom doesn't set them from init). */
function pointer(type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true }) as PointerEvent
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  return event
}

describe('ImageCropDialog', () => {
  it('position mode: dragging the focal dot applies focalX/focalY', async () => {
    const { el, app, applied, dialog } = mountDialog({ image: { src: '/@mechanica/assets/a.png' } })

    const frame = el.querySelector<HTMLElement>('.mech-crop__frame')!
    // Give the frame a measurable box so pointer → normalized math works.
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
    } as DOMRect)

    const dot = el.querySelector<HTMLElement>('.mech-crop__focal')!
    dot.dispatchEvent(pointer('pointerdown', 50, 80))
    window.dispatchEvent(pointer('pointermove', 50, 80))
    window.dispatchEvent(pointer('pointerup', 50, 80))

    // Apply.
    el.querySelector<HTMLButtonElement>('.mech-button.is-primary')!.click()
    await flush()

    expect(applied).toHaveLength(1)
    expect(applied[0]).toMatchObject({ src: '/@mechanica/assets/a.png', focalX: 0.25, focalY: 0.8 })
    expect(applied[0]!.croppedSrc).toBeUndefined()
    expect(dialog.stack).toHaveLength(0) // closed after apply
    app.unmount()
  })

  it('crop mode: applying renders + uploads a derivative and stores the crop', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, blob: async () => new Blob(['x']) }))
    vi.stubGlobal('createImageBitmap', async () => ({ width: 1000, height: 1000, close: () => {} }))
    const original = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) =>
      tag === 'canvas'
        ? ({
            width: 0,
            height: 0,
            getContext: () => ({ drawImage: () => {} }),
            toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['crop'], { type: 'image/webp' })),
          } as unknown as HTMLElement)
        : original(tag, options)) as typeof document.createElement)

    const uploads: string[] = []
    const uploader = async (_blob: Blob, name: string) => {
      uploads.push(name)
      return { src: `/@mechanica/assets/${name}` }
    }

    const { el, applied, app } = mountDialog({
      image: { src: '/@mechanica/assets/hero.png', width: 1000, height: 1000 },
      crop: { width: 500, height: 250 }, // aspect 2 → default frame 1×0.5
      uploader,
    })

    // The default aspect-locked frame (not full) is applied as a crop.
    el.querySelector<HTMLButtonElement>('.mech-button.is-primary')!.click()
    await flush()
    await flush()

    expect(uploads).toHaveLength(1)
    expect(uploads[0]).toMatch(/^hero\.crop-[a-z0-9]+\.webp$/)
    const value = applied[0]!
    expect(value.croppedSrc).toBe(`/@mechanica/assets/${uploads[0]}`)
    // 1000×1000 image, aspect 2 → crop region 1000×500, downscaled into 500×250.
    expect(value.croppedWidth).toBe(500)
    expect(value.croppedHeight).toBe(250)
    expect(value.crop).toEqual({ x: 0, y: 0.25, width: 1, height: 0.5 })
    app.unmount()
  })

  it('crop mode: a full frame clears any previous crop derivative', async () => {
    const { el, applied, app } = mountDialog({
      image: {
        src: '/@mechanica/assets/hero.png',
        width: 1000,
        height: 1000,
        // A previous crop that the reset-to-full should drop.
        crop: { x: 0, y: 0.25, width: 1, height: 0.5 },
        croppedSrc: '/@mechanica/assets/hero.crop-old.webp',
        croppedWidth: 500,
        croppedHeight: 250,
      },
      crop: true, // free crop
    })

    // Reset expands the frame to the whole image → applying drops the crop.
    el.querySelectorAll<HTMLButtonElement>('.mech-button')[0]!.click() // "Reset"
    el.querySelector<HTMLButtonElement>('.mech-button.is-primary')!.click()
    await flush()

    expect(applied[0]!.croppedSrc).toBeUndefined()
    expect(applied[0]!.crop).toBeUndefined()
    app.unmount()
  })
})
