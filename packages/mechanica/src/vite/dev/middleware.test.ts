import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { createDevMiddleware } from './middleware'

let mechDir: string
let server: Server
let base: string

beforeEach(async () => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
  fs.mkdirSync(join(mechDir, 'pages'), { recursive: true })

  const middleware = createDevMiddleware(mechDir)
  server = createServer((req, res) =>
    middleware(req as never, res as never, () => {
      res.statusCode = 404
      res.end('not found')
    }),
  )
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address()
  base = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  fs.rmSync(mechDir, { recursive: true, force: true })
})

describe('dev middleware', () => {
  it('creates, rejects duplicates, saves and lists pages', async () => {
    const create = (body: unknown) =>
      fetch(`${base}/pages`, { method: 'POST', body: JSON.stringify(body) })

    expect((await create({ path: '/about', name: 'About' })).status).toBe(200)
    expect((await create({ path: '/about', name: 'About' })).status).toBe(400)

    const saved = await fetch(`${base}/save?path=/about`, {
      method: 'POST',
      body: JSON.stringify({ content: [{ id: '1', blockId: 'x', data: {} }], data: {} }),
    })
    expect((await saved.json()).success).toBe(true)

    const pages = await (await fetch(`${base}/pages`)).json()
    expect(pages.some((p: { path: string }) => p.path === '/about')).toBe(true)
  })

  it('uploads and serves an asset', async () => {
    const upload = await fetch(`${base}/upload`, {
      method: 'POST',
      headers: { 'x-file-name': 'a.txt' },
      body: 'hello',
    })
    const { src } = await upload.json()
    expect(src).toBe('/@mechanica/assets/a.txt')

    const served = await fetch(`${base}${src.replace('/@mechanica', '')}`)
    expect(await served.text()).toBe('hello')
  })

  it('resolves getPages queries', async () => {
    fs.writeFileSync(join(mechDir, 'pages', 'index.json'), JSON.stringify({ content: [], data: {}, name: 'Home' }))
    const pages = await (await fetch(`${base}/query?q=${encodeURIComponent('getPages.{}')}`)).json()
    expect(pages[0].path).toBe('/')
  })
})
