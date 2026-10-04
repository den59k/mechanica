import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { createEditorService, fsAssetStore, uploadResponse, withHostedAssets, withRemoteAssets, type RemoteAssets } from '@/server'

let mechDir: string
let fetches: string[]
let remoteFiles: Record<string, { data: string; info?: Record<string, unknown> }>

const remote: RemoteAssets = {
  async fetch(name) {
    fetches.push(name)
    const found = remoteFiles[name]
    return found ? { data: new TextEncoder().encode(found.data), ...(found.info ? { info: found.info } : {}) } : null
  },
  list: async () => Object.keys(remoteFiles),
}

const read = async (body: unknown) => new Response(body as BodyInit).text()

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-remote-'))
  fetches = []
  remoteFiles = { 'online-0a1b2c3d.png': { data: 'ONLINE', info: { width: 30, height: 20, previewSrc: 'data:image/webp;base64,p' } } }
})
afterEach(() => fs.rmSync(mechDir, { recursive: true, force: true }))

describe('withRemoteAssets', () => {
  it('fetches what the local store lacks and keeps it', async () => {
    const assets = withRemoteAssets(fsAssetStore(mechDir), remote)

    expect(await read(await assets.open('online-0a1b2c3d.png'))).toBe('ONLINE')
    expect(fs.readFileSync(join(mechDir, 'assets', 'online-0a1b2c3d.png'), 'utf-8')).toBe('ONLINE')
    expect(JSON.parse(fs.readFileSync(join(mechDir, 'images.json'), 'utf-8'))['online-0a1b2c3d.png']).toMatchObject({ width: 30 })

    // The second time it is a local file.
    expect(await read(await assets.open('online-0a1b2c3d.png'))).toBe('ONLINE')
    expect(fetches).toEqual(['online-0a1b2c3d.png'])
  })

  it('never asks the remote about a file that is here', async () => {
    fs.mkdirSync(join(mechDir, 'assets'))
    fs.writeFileSync(join(mechDir, 'assets', 'local.txt'), 'LOCAL')
    const assets = withRemoteAssets(fsAssetStore(mechDir), remote)

    expect(await read(await assets.open('local.txt'))).toBe('LOCAL')
    // No info for it locally (not an image) — still not the remote's to describe.
    expect(await assets.info(['local.txt'])).toEqual({})
    expect(fetches).toEqual([])
  })

  it('serves a fetched upload from memory when it may not be written', async () => {
    const assets = withRemoteAssets(fsAssetStore(mechDir), remote, { cache: () => false })

    expect(await read(await assets.open('online-0a1b2c3d.png'))).toBe('ONLINE')
    expect(await read(await assets.open('online-0a1b2c3d.png'))).toBe('ONLINE')
    expect(await assets.info(['online-0a1b2c3d.png'])).toEqual({
      'online-0a1b2c3d.png': { width: 30, height: 20, previewSrc: 'data:image/webp;base64,p' },
    })
    expect(fetches).toEqual(['online-0a1b2c3d.png'])
    expect(fs.existsSync(join(mechDir, 'assets'))).toBe(false)
    expect(fs.existsSync(join(mechDir, 'images.json'))).toBe(false)
  })

  it('remembers a miss for a while, shares one fetch among concurrent askers', async () => {
    const assets = withRemoteAssets(fsAssetStore(mechDir), remote)
    const [a, b] = await Promise.all([assets.open('nobody.png'), assets.open('nobody.png')])
    expect([a, b]).toEqual([null, null])
    expect(await assets.open('nobody.png')).toBeNull()
    expect(fetches).toEqual(['nobody.png'])
  })

  it('a remote that fails is a miss, not an error', async () => {
    const broken: RemoteAssets = {
      fetch: async () => {
        throw new Error('offline')
      },
      list: async () => {
        throw new Error('offline')
      },
    }
    const assets = withRemoteAssets(fsAssetStore(mechDir), broken)
    expect(await assets.open('online-0a1b2c3d.png')).toBeNull()
    expect(await assets.list()).toEqual([])
    expect(await assets.info(['online-0a1b2c3d.png'])).toEqual({})
  })

  it('lists local and remote uploads together, and writes only locally', async () => {
    const assets = withRemoteAssets(fsAssetStore(mechDir), remote)
    await assets.write('mine.txt', new TextEncoder().encode('MINE'))
    expect((await assets.list()).sort()).toEqual(['mine.txt', 'online-0a1b2c3d.png'])
    expect(Object.keys(remoteFiles)).toEqual(['online-0a1b2c3d.png'])
  })

  it('gives a page its image info for an upload made elsewhere', async () => {
    fs.mkdirSync(join(mechDir, 'pages'), { recursive: true })
    fs.writeFileSync(join(mechDir, 'pages', 'index.page.md'), '::: pic #p1\nimage:\n  src: /media/online-0a1b2c3d.png\n:::\n')
    const service = createEditorService(mechDir, {
      assets: withRemoteAssets(fsAssetStore(mechDir), remote),
      site: {
        format: 1,
        blocks: [
          {
            id: 'pic',
            name: 'Pic',
            props: { type: 'object', properties: { image: { type: 'object', format: 'image', properties: {} } }, required: ['image'] },
          } as never,
        ],
        locales: null,
        generated: [],
      },
    })

    const state = (await (await service.handle(new Request('http://host/state?path=/')))!.json()) as {
      content: { data: { image: unknown } }[]
    }
    expect(state.content[0]!.data.image).toEqual({
      src: '/media/online-0a1b2c3d.png',
      width: 30,
      height: 20,
      previewSrc: 'data:image/webp;base64,p',
    })
    expect(await (await service.asset('online-0a1b2c3d.png'))!.text()).toBe('ONLINE')
    const picker = (await (await service.handle(new Request('http://host/images')))!.json()) as { name: string }[]
    expect(picker.map((image) => image.name)).toEqual(['online-0a1b2c3d.png'])
  })
})

describe('withHostedAssets', () => {
  it('knows the hosted uploads without being able to open them', async () => {
    fs.mkdirSync(join(mechDir, 'assets'))
    fs.writeFileSync(join(mechDir, 'assets', 'local.png'), 'LOCAL')
    fs.writeFileSync(join(mechDir, 'images.json'), JSON.stringify({ 'local.png': { width: 2, height: 2 } }))
    const assets = withHostedAssets(fsAssetStore(mechDir), {
      'hosted-0a1b2c3d.png': { width: 640, height: 480 },
      // The local store has this file: what it knows wins.
      'local.png': { width: 99, height: 99 },
      '../escape.png': { width: 1, height: 1 },
    })

    expect((await assets.list()).sort()).toEqual(['hosted-0a1b2c3d.png', 'local.png'])
    expect(await assets.open('hosted-0a1b2c3d.png')).toBeNull()
    expect(await read(await assets.open('local.png'))).toBe('LOCAL')
    expect(await assets.info(['hosted-0a1b2c3d.png', 'local.png', 'nobody.png'])).toEqual({
      'hosted-0a1b2c3d.png': { width: 640, height: 480 },
      'local.png': { width: 2, height: 2 },
    })
  })
})

describe('uploadResponse', () => {
  it('answers for an upload by its encoded name, with its content type', async () => {
    fs.mkdirSync(join(mechDir, 'assets'))
    fs.writeFileSync(join(mechDir, 'assets', 'team photo.svg'), '<svg/>')
    fs.writeFileSync(join(mechDir, 'data.json'), '{"secret":1}')
    const assets = fsAssetStore(mechDir)

    const found = await uploadResponse(assets, 'team%20photo.svg')
    expect(found!.headers.get('content-type')).toBe('image/svg+xml')
    expect(await found!.text()).toBe('<svg/>')

    expect(await uploadResponse(assets, 'missing.png')).toBeNull()
    expect(await uploadResponse(assets, '..%2Fdata.json')).toBeNull()
    expect(await uploadResponse(null, 'team%20photo.svg')).toBeNull()
    expect((await uploadResponse(assets, '%E0%A4%A'))!.status).toBe(400)
  })
})
