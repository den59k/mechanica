import { describe, it, expect, afterEach, vi } from 'vitest'
import { analyzeImageFile, readImageSize } from '@/editor/lib/image-size'
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
