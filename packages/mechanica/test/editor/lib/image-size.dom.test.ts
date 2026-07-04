import { describe, it, expect, afterEach, vi } from 'vitest'
import { analyzeImageFile, readImageSize, renderCrop } from '@/editor/lib/image-size'
import { stubImageLoading } from '../stub-image'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const stubBitmap = (width: number, height: number) =>
  vi.stubGlobal('createImageBitmap', async () => ({ width, height, close: () => {} }))

/** jsdom's canvas has no 2d context — swap in one that records the downscale. */
function stubCanvas() {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {} }),
    toDataURL: () => 'data:image/webp;base64,stub',
  }
  const original = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) =>
    tag === 'canvas' ? (canvas as unknown as HTMLElement) : original(tag, options)) as typeof document.createElement)
  return canvas
}

describe('readImageSize', () => {
  it('resolves the natural size via the image loader', async () => {
    stubImageLoading()
    expect(await readImageSize('/a.png')).toEqual({ width: 640, height: 480 })
  })
})

describe('analyzeImageFile', () => {
  it('returns dimensions plus a downscaled LQIP data URI, preserving aspect', async () => {
    stubBitmap(800, 400)
    const canvas = stubCanvas()
    expect(await analyzeImageFile(new File(['x'], 'a.png'))).toEqual({
      width: 800,
      height: 400,
      lqip: 'data:image/webp;base64,stub',
    })
    expect(canvas.width).toBe(24)
    expect(canvas.height).toBe(12)
  })

  it('skips the LQIP for small images (icons)', async () => {
    stubBitmap(64, 64)
    stubCanvas()
    expect(await analyzeImageFile(new File(['x'], 'icon.png'))).toEqual({ width: 64, height: 64 })
  })

  it('degrades to null when the file cannot be decoded (jsdom has no createImageBitmap)', async () => {
    expect(await analyzeImageFile(new File(['x'], 'a.png'))).toBeNull()
  })
})

/** A canvas stub that records its size + drawImage args and yields a blob. */
function stubCropCanvas(blob: Blob | null = new Blob(['crop'], { type: 'image/webp' })) {
  const draw: number[][] = []
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (_img: unknown, ...args: number[]) => draw.push(args) }),
    toBlob: (cb: (b: Blob | null) => void) => cb(blob),
  }
  const original = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) =>
    tag === 'canvas' ? (canvas as unknown as HTMLElement) : original(tag, options)) as typeof document.createElement)
  return { canvas, draw }
}

describe('renderCrop', () => {
  it('crops a region and downscales it into the target box', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, blob: async () => new Blob(['x']) }))
    stubBitmap(2000, 1000)
    const { canvas, draw } = stubCropCanvas()

    // Left half of a 2000×1000 image → a 1000×1000 region, into a 600×600 box.
    const result = await renderCrop('/@mechanica/assets/hero.png', { x: 0, y: 0, width: 0.5, height: 1 }, {
      width: 600,
      height: 600,
    })

    expect(result).toEqual({ blob: expect.any(Blob), width: 600, height: 600 })
    expect(canvas.width).toBe(600)
    expect(canvas.height).toBe(600)
    // drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh)
    expect(draw[0]).toEqual([0, 0, 1000, 1000, 0, 0, 600, 600])
  })

  it('a free crop caps the long edge and never upscales', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, blob: async () => new Blob(['x']) }))
    stubBitmap(5000, 2500)
    const { canvas } = stubCropCanvas()

    // No target box → capped at 2560 on the long edge (scale 0.512).
    const result = await renderCrop('/@mechanica/assets/big.png', { x: 0, y: 0, width: 1, height: 1 })
    expect(result).toEqual({ blob: expect.any(Blob), width: 2560, height: 1280 })
    expect(canvas.width).toBe(2560)
  })

  it('is null when the source cannot be fetched', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false }))
    expect(await renderCrop('/missing.png', { x: 0, y: 0, width: 1, height: 1 })).toBeNull()
  })

  it('is null when canvas encoding is unavailable (jsdom)', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, blob: async () => new Blob(['x']) }))
    stubBitmap(800, 600)
    stubCropCanvas(null)
    expect(await renderCrop('/a.png', { x: 0, y: 0, width: 1, height: 1 })).toBeNull()
  })
})
