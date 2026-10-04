import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  fsAssetStore,
  storeUpload,
  listUploads,
  uploadName,
  isAssetName,
  isDerivedAsset,
  assetFileOf,
  readImageManifest,
  updateImageManifest,
  harvestImageMeta,
  applyImageManifest,
  contentImageNames,
  type AssetStore,
} from '@/server/assets-store'
import { setSharpModule } from '@/server/image-preview'

let mechDir: string
let assets: AssetStore

const bytes = (text: string) => new TextEncoder().encode(text)
const hashOf = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 8)

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
  assets = fsAssetStore(mechDir)
})
afterEach(() => {
  fs.rmSync(mechDir, { recursive: true, force: true })
  setSharpModule(undefined)
})

describe('uploadName', () => {
  it('adds a short hash of the content to the file name', () => {
    expect(uploadName('logo.png', bytes('data'))).toBe(`logo-${hashOf('data')}.png`)
    expect(uploadName('archive.tar.gz', bytes('data'))).toBe(`archive.tar-${hashOf('data')}.gz`)
    expect(uploadName('README', bytes('data'))).toBe(`README-${hashOf('data')}`)
  })

  it('names the same content the same and different content differently', () => {
    expect(uploadName('logo.png', bytes('one'))).toBe(uploadName('logo.png', bytes('one')))
    expect(uploadName('logo.png', bytes('one'))).not.toBe(uploadName('logo.png', bytes('two')))
  })

  it('does not stack hashes when a stored file is uploaded again', () => {
    const stored = uploadName('logo.png', bytes('data'))
    expect(uploadName(stored, bytes('data'))).toBe(stored)
  })

  it('never keeps a path', () => {
    expect(uploadName('../../etc/passwd', bytes('x'))).toBe(`passwd-${hashOf('x')}`)
    expect(uploadName('C:\\Users\\me\\pic.png', bytes('x'))).toBe(`pic-${hashOf('x')}.png`)
    expect(isAssetName(uploadName('..', bytes('x')))).toBe(true)
  })
})

describe('isAssetName', () => {
  it('accepts a flat filename only', () => {
    expect(isAssetName('photo 1.png')).toBe(true)
    expect(isAssetName('')).toBe(false)
    expect(isAssetName('..')).toBe(false)
    expect(isAssetName('a/b.png')).toBe(false)
    expect(isAssetName('..\\b.png')).toBe(false)
  })
})

describe('storeUpload / listUploads', () => {
  it('stores an upload under its hashed name and lists it', async () => {
    const stored = `pic-${hashOf('data')}.png`
    const result = await storeUpload(assets, 'pic.png', bytes('data'))
    expect(result).toEqual({ src: `/media/${stored}`, name: 'pic.png' })
    expect(fs.readFileSync(join(mechDir, 'assets', stored), 'utf-8')).toBe('data')

    expect(await listUploads(assets)).toEqual([{ id: `pic-${hashOf('data')}`, name: stored, src: `/media/${stored}` }])
  })

  it('stores the same file once, however often it is uploaded', async () => {
    const first = await storeUpload(assets, 'pic.png', bytes('data'))
    const second = await storeUpload(assets, 'pic.png', bytes('data'))
    expect(second.src).toBe(first.src)
    expect(fs.readdirSync(join(mechDir, 'assets'))).toHaveLength(1)
  })

  it('keeps two different files of the same name apart', async () => {
    const first = await storeUpload(assets, 'pic.png', bytes('one'))
    const second = await storeUpload(assets, 'pic.png', bytes('two'))
    expect(second.src).not.toBe(first.src)
    expect(fs.readdirSync(join(mechDir, 'assets'))).toHaveLength(2)
  })

  it('lists nothing when no assets exist', async () => {
    expect(await listUploads(assets)).toEqual([])
  })

  it('hides cropped derivatives from the library listing', async () => {
    await storeUpload(assets, 'hero.png', bytes('data'))
    await storeUpload(assets, 'hero.crop-abc123.webp', bytes('crop'), { derived: true })
    expect((await listUploads(assets)).map((image) => image.name)).toEqual([`hero-${hashOf('data')}.png`])
  })
})

describe('derived uploads', () => {
  it('are written under the name the client computed', async () => {
    const result = await storeUpload(assets, 'hero.crop-abc123.webp', bytes('crop'), { derived: true })
    expect(result).toEqual({ src: '/media/hero.crop-abc123.webp', name: 'hero.crop-abc123.webp' })
    expect(fs.readFileSync(join(mechDir, 'assets', 'hero.crop-abc123.webp'), 'utf-8')).toBe('crop')
  })

  it('overwrite the same name (idempotent re-crop)', async () => {
    await storeUpload(assets, 'hero.crop-abc123.webp', bytes('one'), { derived: true })
    await storeUpload(assets, 'hero.crop-abc123.webp', bytes('two'), { derived: true })
    expect(fs.readdirSync(join(mechDir, 'assets'))).toEqual(['hero.crop-abc123.webp'])
    expect(fs.readFileSync(join(mechDir, 'assets', 'hero.crop-abc123.webp'), 'utf-8')).toBe('two')
  })

  it('refuse a name that is a path', async () => {
    await expect(storeUpload(assets, '../hero.crop-abc123.webp', bytes('x'), { derived: true })).rejects.toThrow()
    expect(fs.existsSync(join(mechDir, 'hero.crop-abc123.webp'))).toBe(false)
  })

  it('never touch the image info (derivatives reuse the original LQIP)', async () => {
    await storeUpload(assets, 'hero.crop-abc123.webp', bytes('crop'), { derived: true })
    expect(readImageManifest(mechDir)).toEqual({})
  })

  it('are recognized by their filename', () => {
    expect(isDerivedAsset('hero.crop-abc123.webp')).toBe(true)
    expect(isDerivedAsset('hero.png')).toBe(false)
    expect(isDerivedAsset('hero.crop.webp')).toBe(false)
  })
})

describe('fsAssetStore', () => {
  it('opens a stored file and nothing outside its directory', async () => {
    await assets.write('a.txt', bytes('hello'))
    fs.writeFileSync(join(mechDir, 'data.json'), '{"secret":1}')

    expect(await new Response((await assets.open('a.txt')) as BodyInit).text()).toBe('hello')
    expect(await assets.open('missing.txt')).toBeNull()
    expect(await assets.open('../data.json')).toBeNull()
    await expect(assets.write('../x.txt', bytes('x'))).rejects.toThrow()
  })

  it('keeps image info in images.json and answers only for the names asked', async () => {
    await assets.saveInfo({ 'a.png': { width: 10, height: 20 }, 'b.png': { width: 1, height: 2 } })
    await assets.saveInfo({ 'a.png': { previewSrc: 'data:image/webp;base64,x' } })

    expect(await assets.info(['a.png', 'unknown.png'])).toEqual({
      'a.png': { width: 10, height: 20, previewSrc: 'data:image/webp;base64,x' },
    })
    expect(Object.keys(readImageManifest(mechDir)).sort()).toEqual(['a.png', 'b.png'])
  })

  it('enriches raster uploads with dimensions + LQIP when sharp is available', async () => {
    setSharpModule(((_buffer: Buffer) => ({
      metadata: async () => ({ width: 900, height: 450 }),
      resize: () => ({ webp: () => ({ toBuffer: async () => Buffer.from('preview') }) }),
    })) as never)
    const info = {
      width: 900,
      height: 450,
      previewSrc: `data:image/webp;base64,${Buffer.from('preview').toString('base64')}`,
    }

    const stored = `photo-${hashOf('data')}.png`
    const result = await storeUpload(assets, 'photo.png', bytes('data'))
    expect(result).toEqual({ src: `/media/${stored}`, name: 'photo.png', ...info })
    // The analysis is also kept as the image's info.
    expect(await assets.info([stored])).toEqual({ [stored]: info })

    // Non-raster files skip analysis entirely, sharp or not.
    const doc = await storeUpload(assets, 'notes.txt', bytes('hi'))
    expect(doc).toEqual({ src: `/media/notes-${hashOf('hi')}.txt`, name: 'notes.txt' })
    expect(Object.keys(readImageManifest(mechDir))).toEqual([stored])
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
    expect(assetFileOf('/other/x.png')).toBeNull()
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

  it('recognizes uploads by the current and the pre-2.1 prefix', () => {
    expect(assetFileOf('/media/a%20b.png')).toBe('a b.png')
    expect(assetFileOf('/@mechanica/assets/a.png')).toBe('a.png')
    expect(assetFileOf('/assets/a.png')).toBeNull()
    expect(assetFileOf('https://cdn.example/media/a.png')).toBeNull()

    const content = [
      { id: '1', blockId: 'pic', data: { image: { src: '/media/a.png' } } },
      { id: '2', blockId: 'pic', data: { image: { src: '/@mechanica/assets/b.png' } } },
      { id: '3', blockId: 'pic', data: { image: { src: '/media/a.png' } } },
      { id: '4', blockId: 'pic', data: { image: { src: 'https://example.com/c.png' } } },
    ]
    expect(contentImageNames(content as never, picBlocks as never)).toEqual(['a.png', 'b.png'])
  })

  it('harvest also drops the legacy previewSrc === src fallback', () => {
    const content = [
      { id: '1', blockId: 'pic', data: { image: { src: '/@mechanica/assets/a.png', previewSrc: '/@mechanica/assets/a.png' } } },
    ]
    harvestImageMeta(content as never, picBlocks as never)
    expect((content[0]!.data as Record<string, any>).image.previewSrc).toBeUndefined()
  })
})
