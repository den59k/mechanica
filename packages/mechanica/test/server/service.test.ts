import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { createEditorService, type EditorService } from '@/server'

let mechDir: string
let service: EditorService

const call = (path: string, init?: RequestInit) => service.handle(new Request(`http://host${path}`, init))
const post = (path: string, body: unknown) => call(path, { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
  fs.mkdirSync(join(mechDir, 'pages'), { recursive: true })
  service = createEditorService(mechDir)
})

afterEach(() => fs.rmSync(mechDir, { recursive: true, force: true }))

describe('editor service', () => {
  it('answers plain Request objects — no HTTP server involved', async () => {
    expect((await post('/pages', { path: '/about', name: 'About' }))!.status).toBe(200)

    const saved = await post('/save?path=/about', { content: [{ id: '1', blockId: 'x', data: {} }], pageData: {} })
    const { version } = (await saved!.json()) as { version: string }
    expect(version).toBeTypeOf('string')

    const pages = (await (await call('/pages'))!.json()) as { path: string }[]
    expect(pages.map((page) => page.path)).toContain('/about')

    // A stale version is a conflict, not an overwrite.
    const stale = await post('/save?path=/about', { content: [], pageData: {}, version: 'stale' })
    expect(stale!.status).toBe(409)
  })

  it('resolves to null for a route it does not own', async () => {
    expect(await call('/nope')).toBeNull()
    expect(await call('/pages', { method: 'PUT' })).toBeNull()
  })

  it('turns a thrown error into a 500 with the message', async () => {
    const response = await call('/save?path=/about', { method: 'POST', body: '{not json' })
    expect(response!.status).toBe(500)
    expect(((await response!.json()) as { error: string }).error).toBeTruthy()
  })

  it('serves assets with their content type and keeps to the directory', async () => {
    fs.mkdirSync(join(mechDir, 'assets'))
    fs.writeFileSync(join(mechDir, 'assets', 'logo mark.svg'), '<svg/>')
    fs.writeFileSync(join(mechDir, 'data.json'), '{"secret":1}')

    const ok = await call('/assets/logo%20mark.svg')
    expect(ok!.status).toBe(200)
    expect(ok!.headers.get('content-type')).toBe('image/svg+xml')
    expect(await ok!.text()).toBe('<svg/>')

    expect((await call('/assets/missing.png'))!.status).toBe(404)
    expect((await call('/assets/..%2Fdata.json'))!.status).toBe(403)
    expect((await call('/assets/%E0%A4%A'))!.status).toBe(400)
  })

  it('stores an upload under its decoded name', async () => {
    const response = await call('/upload', {
      method: 'POST',
      headers: { 'x-file-name': encodeURIComponent('мой файл.txt') },
      body: 'hello',
    })
    const { src } = (await response!.json()) as { src: string }
    expect(src.startsWith('/@mechanica/assets/')).toBe(true)
    expect(fs.readdirSync(join(mechDir, 'assets'))).toHaveLength(1)
  })
})
