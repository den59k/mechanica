import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { runImages } from '@/cli/images'
import { setSharpModule } from '@/server/image-preview'

const PREVIEW_URI = `data:image/webp;base64,${Buffer.from('preview').toString('base64')}`

const fakeSharp = (width: number, height: number) =>
  ((_buffer: Buffer) => ({
    metadata: async () => ({ width, height }),
    resize: () => ({ webp: () => ({ toBuffer: async () => Buffer.from('preview') }) }),
  })) as never

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(os.tmpdir(), 'mech-images-'))
  await mkdir(join(dir, '.mech/assets'), { recursive: true })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
  setSharpModule(undefined)
})

describe('mechanica images', () => {
  it('fails with an install hint when sharp is missing', async () => {
    setSharpModule(null)
    await writeFile(join(dir, '.mech/assets/a.png'), 'PNG')
    await expect(runImages({ cwd: dir })).rejects.toThrow(/sharp/)
  })

  it('analyzes raster assets into the manifest, skipping complete entries on re-runs', async () => {
    setSharpModule(fakeSharp(800, 400))
    await writeFile(join(dir, '.mech/assets/a.png'), 'PNG')
    await writeFile(join(dir, '.mech/assets/notes.txt'), 'not an image')

    await runImages({ cwd: dir })

    const manifestFile = join(dir, '.mech/images.json')
    const manifest = JSON.parse(await readFile(manifestFile, 'utf-8'))
    expect(manifest['a.png']).toEqual({ width: 800, height: 400, previewSrc: PREVIEW_URI })
    expect(manifest['notes.txt']).toBeUndefined()

    // A second run finds everything complete and rewrites nothing.
    const before = await readFile(manifestFile, 'utf-8')
    await runImages({ cwd: dir })
    expect(await readFile(manifestFile, 'utf-8')).toBe(before)
  })

  it('small images get dimensions only, and stay "complete" without a preview', async () => {
    setSharpModule(fakeSharp(64, 64))
    await writeFile(join(dir, '.mech/assets/icon.png'), 'PNG')

    await runImages({ cwd: dir })
    const manifestFile = join(dir, '.mech/images.json')
    expect(JSON.parse(await readFile(manifestFile, 'utf-8'))['icon.png']).toEqual({ width: 64, height: 64 })

    const before = await readFile(manifestFile, 'utf-8')
    await runImages({ cwd: dir }) // no --force: nothing recomputed
    expect(await readFile(manifestFile, 'utf-8')).toBe(before)
  })
})
