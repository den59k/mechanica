import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  getUniqueName,
  saveUpload,
  saveDerivedAsset,
  isDerivedAsset,
  listImages,
  assetFileOf,
  readImageManifest,
  updateImageManifest,
  harvestImageMeta,
  applyImageManifest,
} from '@/vite/dev/assets-store'
import { setSharpModule } from '@/vite/dev/image-preview'

let mechDir: string

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
})
afterEach(() => {
  fs.rmSync(mechDir, { recursive: true, force: true })
  setSharpModule(undefined)
})

describe('getUniqueName', () => {
  it('returns the name unchanged when free', () => {
    expect(getUniqueName(mechDir, 'logo.png')).toBe('logo.png')
  })
  it('suffixes colliding names', () => {
    fs.writeFileSync(join(mechDir, 'logo.png'), '')
    expect(getUniqueName(mechDir, 'logo.png')).toBe('logo_1.png')
    fs.writeFileSync(join(mechDir, 'logo_1.png'), '')
    expect(getUniqueName(mechDir, 'logo.png')).toBe('logo_2.png')
  })
})

describe('saveUpload / listImages', () => {
  it('stores an upload and lists it', async () => {
    const result = await saveUpload(mechDir, 'pic.png', Buffer.from('data'))
    expect(result).toEqual({ src: '/@mechanica/assets/pic.png', name: 'pic.png' })

    const images = listImages(mechDir)
    expect(images).toHaveLength(1)
    expect(images[0]).toMatchObject({ name: 'pic.png', src: '/@mechanica/assets/pic.png' })
  })

  it('lists nothing when no assets exist', () => {
    expect(listImages(mechDir)).toEqual([])
  })

  it('hides cropped derivatives from the library listing', async () => {
    await saveUpload(mechDir, 'hero.png', Buffer.from('data'))
    await saveDerivedAsset(mechDir, 'hero.crop-abc123.webp', Buffer.from('crop'))
    const names = listImages(mechDir).map((image) => image.name)
    expect(names).toEqual(['hero.png'])
  })
})

describe('saveDerivedAsset / isDerivedAsset', () => {
  it('writes the derivative verbatim and returns its src', async () => {
    const result = await saveDerivedAsset(mechDir, 'hero.crop-abc123.webp', Buffer.from('crop'))
    expect(result).toEqual({
      src: '/@mechanica/assets/hero.crop-abc123.webp',
      name: 'hero.crop-abc123.webp',
    })
    expect(fs.readFileSync(join(mechDir, 'assets', 'hero.crop-abc123.webp'), 'utf-8')).toBe('crop')
  })

  it('overwrites the same name (idempotent re-crop, no _1 spam)', async () => {
    await saveDerivedAsset(mechDir, 'hero.crop-abc123.webp', Buffer.from('one'))
    await saveDerivedAsset(mechDir, 'hero.crop-abc123.webp', Buffer.from('two'))
    expect(fs.readdirSync(join(mechDir, 'assets'))).toEqual(['hero.crop-abc123.webp'])
    expect(fs.readFileSync(join(mechDir, 'assets', 'hero.crop-abc123.webp'), 'utf-8')).toBe('two')
  })

  it('never touches the image manifest (derivatives reuse the original LQIP)', async () => {
    await saveDerivedAsset(mechDir, 'hero.crop-abc123.webp', Buffer.from('crop'))
    expect(readImageManifest(mechDir)).toEqual({})
  })

  it('recognizes derivative filenames', () => {
    expect(isDerivedAsset('hero.crop-abc123.webp')).toBe(true)
    expect(isDerivedAsset('hero.png')).toBe(false)
    expect(isDerivedAsset('hero.crop.webp')).toBe(false)
  })

  it('enriches raster uploads with dimensions + LQIP when sharp is available', async () => {
    setSharpModule(((_buffer: Buffer) => ({
      metadata: async () => ({ width: 900, height: 450 }),
      resize: () => ({ webp: () => ({ toBuffer: async () => Buffer.from('preview') }) }),
    })) as never)

    const result = await saveUpload(mechDir, 'photo.png', Buffer.from('data'))
    expect(result).toEqual({
      src: '/@mechanica/assets/photo.png',
      name: 'photo.png',
      width: 900,
      height: 450,
      previewSrc: `data:image/webp;base64,${Buffer.from('preview').toString('base64')}`,
    })
    // The analysis is also cached in the image manifest.
    expect(readImageManifest(mechDir)['photo.png']).toEqual({
      width: 900,
      height: 450,
      previewSrc: `data:image/webp;base64,${Buffer.from('preview').toString('base64')}`,
    })

    // Non-raster files skip analysis entirely, sharp or not.
    const doc = await saveUpload(mechDir, 'notes.txt', Buffer.from('hi'))
    expect(doc).toEqual({ src: '/@mechanica/assets/notes.txt', name: 'notes.txt' })
    expect(readImageManifest(mechDir)['notes.txt']).toBeUndefined()
  })
})

describe('image manifest', () => {
  const picBlocks = new Map([
    [
      'pic',
      {
        id: 'pic',
        name: 'Pic',
        props: {
          type: 'object',
          properties: { image: { type: 'object', format: 'image', properties: {} } },
          required: ['image'],
        },
      },
    ],
  ])

  it('assetFileOf maps uploaded-asset srcs to filenames', () => {
    expect(assetFileOf('/@mechanica/assets/a%20b.png')).toBe('a b.png')
    expect(assetFileOf('/media/x.png')).toBeNull()
    expect(assetFileOf(undefined)).toBeNull()
  })

  it('updateImageManifest merges entries without losing existing fields', () => {
    updateImageManifest(mechDir, { 'a.png': { width: 10, height: 20 } })
    updateImageManifest(mechDir, { 'a.png': { previewSrc: 'data:image/webp;base64,x' } })
    expect(readImageManifest(mechDir)['a.png']).toEqual({
      width: 10,
      height: 20,
      previewSrc: 'data:image/webp;base64,x',
    })
  })

  it('harvest strips preview blobs out of content; apply injects them back', () => {
    const content = [
      {
        id: '1',
        blockId: 'pic',
        data: {
          image: { src: '/@mechanica/assets/a.png', previewSrc: 'data:image/webp;base64,x', width: 5, height: 6 },
        },
      },
    ]

    const entries = harvestImageMeta(content as never, picBlocks as never)
    expect(entries).toEqual({ 'a.png': { width: 5, height: 6, previewSrc: 'data:image/webp;base64,x' } })
    const image = (content[0]!.data as Record<string, any>).image
    expect(image.previewSrc).toBeUndefined()
    expect(image.width).toBe(5) // dimensions stay in page data — they're readable

    applyImageManifest(content as never, picBlocks as never, entries)
    expect(image.previewSrc).toBe('data:image/webp;base64,x')
  })

  it('harvest also drops the legacy previewSrc === src fallback', () => {
    const content = [
      { id: '1', blockId: 'pic', data: { image: { src: '/@mechanica/assets/a.png', previewSrc: '/@mechanica/assets/a.png' } } },
    ]
    harvestImageMeta(content as never, picBlocks as never)
    expect((content[0]!.data as Record<string, any>).image.previewSrc).toBeUndefined()
  })
})
