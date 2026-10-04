import { describe, it, expect, afterEach } from 'vitest'
import { analyzeImageBuffer, hasSharp, isRasterImage, setSharpModule } from '@/server/image-preview'

// 'preview' base64-encoded — what the fake sharp's webp buffer serializes to.
const PREVIEW_URI = `data:image/webp;base64,${Buffer.from('preview').toString('base64')}`

/** A fake sharp module reporting the given intrinsic size. */
const fakeSharp = (width: number, height: number) =>
  ((_buffer: Buffer) => ({
    metadata: async () => ({ width, height }),
    resize: () => ({ webp: () => ({ toBuffer: async () => Buffer.from('preview') }) }),
  })) as never

afterEach(() => setSharpModule(undefined)) // restore the real loader

describe('isRasterImage', () => {
  it('matches raster extensions only', () => {
    expect(isRasterImage('photo.PNG')).toBe(true)
    expect(isRasterImage('photo.jpeg')).toBe(true)
    expect(isRasterImage('icon.svg')).toBe(false)
    expect(isRasterImage('notes.txt')).toBe(false)
  })
})

describe('analyzeImageBuffer', () => {
  it('resolves null when sharp is not installed (it is optional)', async () => {
    setSharpModule(null)
    expect(await hasSharp()).toBe(false)
    expect(await analyzeImageBuffer(Buffer.from('x'))).toBeNull()
  })

  it('returns dimensions plus a LQIP data URI through sharp', async () => {
    setSharpModule(fakeSharp(900, 450))
    expect(await hasSharp()).toBe(true)
    expect(await analyzeImageBuffer(Buffer.from('x'))).toEqual({
      width: 900,
      height: 450,
      previewSrc: PREVIEW_URI,
    })
  })

  it('skips the LQIP for small images (icons)', async () => {
    setSharpModule(fakeSharp(64, 64))
    expect(await analyzeImageBuffer(Buffer.from('x'))).toEqual({ width: 64, height: 64 })
  })

  it('resolves null when decoding throws', async () => {
    setSharpModule(((_buffer: Buffer) => ({
      metadata: async () => {
        throw new Error('unsupported')
      },
    })) as never)
    expect(await analyzeImageBuffer(Buffer.from('x'))).toBeNull()
  })
})
