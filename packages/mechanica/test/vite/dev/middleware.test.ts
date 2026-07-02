import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { parsePage, serializePage } from '@mechanica/shared'
import { createDevMiddleware } from '@/vite/dev/middleware'

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

  it('persists the data scope buckets to their stores on save', async () => {
    await fetch(`${base}/pages`, { method: 'POST', body: JSON.stringify({ path: '/about', name: 'About' }) })
    await fetch(`${base}/save?path=/about`, {
      method: 'POST',
      body: JSON.stringify({
        content: [],
        siteData: { header: { logo: 'a.svg' } },
        folderData: {},
        pageData: { seo: { title: 'About' } },
      }),
    })

    const page = parsePage(fs.readFileSync(join(mechDir, 'pages', 'about.page.md'), 'utf-8'))
    expect(page.data).toEqual({ seo: { title: 'About' } })

    const site = JSON.parse(fs.readFileSync(join(mechDir, 'data.json'), 'utf-8'))
    expect(site).toEqual({ header: { logo: 'a.svg' } })
  })

  it('routes folder-bucket data to the shared folders file', async () => {
    await fetch(`${base}/pages`, {
      method: 'POST',
      body: JSON.stringify({ path: '/post', name: 'Post', folderId: 'blog' }),
    })
    await fetch(`${base}/save?path=/blog/post`, {
      method: 'POST',
      body: JSON.stringify({
        content: [],
        siteData: {},
        folderData: { nav: { items: ['Home'] } },
        pageData: { seo: { title: 'Post' } },
      }),
    })

    const page = parsePage(fs.readFileSync(join(mechDir, 'pages', 'blog', 'post.page.md'), 'utf-8'))
    expect(page.data).toEqual({ seo: { title: 'Post' } })

    const folders = JSON.parse(fs.readFileSync(join(mechDir, 'folders.json'), 'utf-8'))
    expect(folders).toEqual({ blog: { nav: { items: ['Home'] } } })
  })

  it('edits a page name and moves it to a new path', async () => {
    await fetch(`${base}/pages`, { method: 'POST', body: JSON.stringify({ path: '/about', name: 'About' }) })
    const res = await fetch(`${base}/pages?path=/about`, {
      method: 'POST',
      body: JSON.stringify({ name: 'About us', path: '/about-us' }),
    })
    const body = await res.json()
    expect(body).toMatchObject({ success: true, path: '/about-us' })
    expect(fs.existsSync(join(mechDir, 'pages', 'about.page.md'))).toBe(false)
    const moved = parsePage(fs.readFileSync(join(mechDir, 'pages', 'about-us.page.md'), 'utf-8'))
    expect(moved.name).toBe('About us')
    expect(moved.path).toBe('/about-us')
  })

  it('rejects moving a page onto an existing path', async () => {
    const create = (body: unknown) => fetch(`${base}/pages`, { method: 'POST', body: JSON.stringify(body) })
    await create({ path: '/a', name: 'A' })
    await create({ path: '/b', name: 'B' })
    const res = await fetch(`${base}/pages?path=/a`, {
      method: 'POST',
      body: JSON.stringify({ name: 'A', path: '/b' }),
    })
    expect(res.status).toBe(400)
  })

  it('duplicates and deletes a page', async () => {
    const create = (body: unknown) =>
      fetch(`${base}/pages`, { method: 'POST', body: JSON.stringify(body) })
    await create({ path: '/a', name: 'A' })
    await fetch(`${base}/save?path=/a`, {
      method: 'POST',
      body: JSON.stringify({ content: [{ id: '1', blockId: 'x', data: {} }], data: {} }),
    })

    const dup = await fetch(`${base}/pages/duplicate?path=/a`, {
      method: 'POST',
      body: JSON.stringify({ path: '/b', name: 'B' }),
    })
    expect(dup.status).toBe(200)
    const copy = parsePage(fs.readFileSync(join(mechDir, 'pages', 'b.page.md'), 'utf-8'))
    expect(copy.content).toHaveLength(1)
    expect(copy.name).toBe('B')

    const del = await fetch(`${base}/pages?path=/a`, { method: 'DELETE' })
    expect((await del.json()).success).toBe(true)
    expect(fs.existsSync(join(mechDir, 'pages', 'a.page.md'))).toBe(false)
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

  it('refuses to serve assets outside the assets directory', async () => {
    // A file that must never be reachable through /assets/.
    fs.writeFileSync(join(mechDir, 'data.json'), '{"secret":true}')
    fs.mkdirSync(join(mechDir, 'assets'), { recursive: true })

    // Encoded `..` survives client-side URL normalization; the middleware
    // decodes it and must still contain the path.
    const traversal = await fetch(`${base}/assets/..%2Fdata.json`)
    expect(traversal.status).toBe(403)

    const deep = await fetch(`${base}/assets/..%2F..%2F..%2Fetc%2Fpasswd`)
    expect(deep.status).toBe(403)

    const absolute = await fetch(`${base}/assets/${encodeURIComponent(join(mechDir, 'data.json'))}`)
    expect(absolute.status).toBe(403)
  })

  it('resolves getPages queries', async () => {
    fs.writeFileSync(join(mechDir, 'pages', 'index.page.md'), serializePage({ content: [], data: {}, name: 'Home' }))
    const pages = await (await fetch(`${base}/query?q=${encodeURIComponent('getPages.{}')}`)).json()
    expect(pages[0].path).toBe('/')
  })
})
