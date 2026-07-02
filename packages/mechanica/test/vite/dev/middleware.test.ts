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

  const middleware = createDevMiddleware(mechDir, {
    blocks: () => [
      { id: 'hero', name: 'Hero' },
      { id: 'internal', name: 'Internal', hidden: true },
    ],
  })
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

  it('serves merged page state with the on-disk version', async () => {
    await fetch(`${base}/pages`, { method: 'POST', body: JSON.stringify({ path: '/about', name: 'About' }) })
    await fetch(`${base}/save?path=/about`, {
      method: 'POST',
      body: JSON.stringify({
        content: [{ id: '1', blockId: 'x', data: {} }],
        siteData: { header: { logo: 'a.svg' } },
        pageData: { seo: { title: 'About' } },
      }),
    })

    const state = await (await fetch(`${base}/state?path=/about`)).json()
    expect(state.content).toHaveLength(1)
    expect(state.data).toEqual({ header: { logo: 'a.svg' }, seo: { title: 'About' } })
    expect(state.siteData).toEqual({ header: { logo: 'a.svg' } })
    expect(state.pageData).toEqual({ seo: { title: 'About' } })
    expect(typeof state.version).toBe('string')
  })

  it('rejects saves over external edits unless forced', async () => {
    await fetch(`${base}/pages`, { method: 'POST', body: JSON.stringify({ path: '/about', name: 'About' }) })
    const first = await (
      await fetch(`${base}/save?path=/about`, {
        method: 'POST',
        body: JSON.stringify({ content: [{ id: '1', blockId: 'x', data: {} }] }),
      })
    ).json()
    expect(typeof first.version).toBe('string')

    // Simulate an external edit (Claude touching the .page.md directly).
    const file = join(mechDir, 'pages', 'about.page.md')
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8') + '\n')

    const stale = await fetch(`${base}/save?path=/about`, {
      method: 'POST',
      body: JSON.stringify({ content: [], version: first.version }),
    })
    expect(stale.status).toBe(409)
    expect((await stale.json()).error).toBe('conflict')

    // A matching version saves fine and returns the next version.
    const current = await (await fetch(`${base}/state?path=/about`)).json()
    const ok = await fetch(`${base}/save?path=/about`, {
      method: 'POST',
      body: JSON.stringify({ content: [], version: current.version }),
    })
    expect(ok.status).toBe(200)

    // Forcing overrides the check ("keep mine").
    const forced = await fetch(`${base}/save?path=/about`, {
      method: 'POST',
      body: JSON.stringify({ content: [], version: first.version, force: true }),
    })
    expect(forced.status).toBe(200)
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

  it('serves page thumbnails from .mech/thumbs with the same containment', async () => {
    fs.mkdirSync(join(mechDir, 'thumbs'), { recursive: true })
    fs.writeFileSync(join(mechDir, 'thumbs', 'docs.png'), 'png-bytes')

    const ok = await fetch(`${base}/thumbs/docs.png`)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-cache')
    expect(await ok.text()).toBe('png-bytes')

    expect((await fetch(`${base}/thumbs/missing.png`)).status).toBe(404)

    fs.writeFileSync(join(mechDir, 'data.json'), '{"secret":true}')
    expect((await fetch(`${base}/thumbs/..%2Fdata.json`)).status).toBe(403)
  })

  it('serves a paginated variant URL as its base page with pagination context', async () => {
    await fetch(`${base}/pages`, { method: 'POST', body: JSON.stringify({ path: '/news', name: 'News' }) })
    await fetch(`${base}/save?path=/news`, {
      method: 'POST',
      body: JSON.stringify({ content: [{ id: '1', blockId: 'x', data: {} }] }),
    })

    const state = await (await fetch(`${base}/state?path=/news/2`)).json()
    expect(state.content).toHaveLength(1) // the base page's content
    expect(state.page.path).toBe('/news') // edits/saves target the real page
    expect(state.page.pagination).toEqual({ page: 2 })

    // A real page at a numeric path still wins over the variant fallback.
    await fetch(`${base}/pages`, { method: 'POST', body: JSON.stringify({ path: '/news/7', name: 'Seven' }) })
    const real = await (await fetch(`${base}/state?path=/news/7`)).json()
    expect(real.page.path).toBe('/news/7')
    expect(real.page.pagination).toBeUndefined()
  })

  it('lists blocks through the provider', async () => {
    const blocks = await (await fetch(`${base}/blocks`)).json()
    expect(blocks).toEqual([
      { id: 'hero', name: 'Hero' },
      { id: 'internal', name: 'Internal', hidden: true },
    ])
  })

  it('resolves getPages queries', async () => {
    fs.writeFileSync(join(mechDir, 'pages', 'index.page.md'), serializePage({ content: [], data: {}, name: 'Home' }))
    const pages = await (await fetch(`${base}/query?q=${encodeURIComponent('getPages.{}')}`)).json()
    expect(pages[0].path).toBe('/')
  })
})
