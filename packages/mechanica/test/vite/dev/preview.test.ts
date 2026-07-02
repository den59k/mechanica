import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { renderPreviewHtml, createPreviewMiddleware } from '@/vite/dev/preview'

describe('renderPreviewHtml', () => {
  it('injects the preview request and the module scripts', () => {
    const html = renderPreviewHtml({ blockId: 'hero', data: { title: 'Hi' } })
    expect(html).toContain('window.__MECHANICA_PREVIEW__ = {"blockId":"hero","data":{"title":"Hi"}}')
    expect(html).toContain('src="/@vite/client"')
    expect(html).toContain('src="/@id/__x00__virtual:mechanica/preview"')
    expect(html).toContain('<div id="app"></div>')
  })

  it('keeps the inline payload script-safe', () => {
    const html = renderPreviewHtml({ blockId: 'hero', data: { html: '</script><script>' } })
    expect(html).not.toContain('</script><script>alert')
    expect(html).toContain('\\u003c/script>')
  })

  it('escapes the block id in the title', () => {
    const html = renderPreviewHtml({ blockId: '<img onerror=x>' })
    expect(html).toContain('<title>Block preview — &lt;img onerror=x&gt;</title>')
  })
})

describe('preview middleware', () => {
  let server: Server
  let base: string

  beforeEach(async () => {
    const middleware = createPreviewMiddleware()
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
  })

  it('serves the preview shell for a block id', async () => {
    const res = await fetch(`${base}/hero`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('"blockId":"hero"')
  })

  it('passes a ?data= JSON object through to the request payload', async () => {
    const data = encodeURIComponent(JSON.stringify({ title: 'Hello' }))
    const html = await (await fetch(`${base}/hero?data=${data}`)).text()
    expect(html).toContain('"data":{"title":"Hello"}')
  })

  it('rejects a missing block id and malformed data', async () => {
    expect((await fetch(`${base}/`)).status).toBe(400)
    expect((await fetch(`${base}/hero?data={oops`)).status).toBe(400)
    expect((await fetch(`${base}/hero?data=[1]`)).status).toBe(400)
  })

  it('lets non-GET requests fall through', async () => {
    expect((await fetch(`${base}/hero`, { method: 'POST' })).status).toBe(404)
  })
})
