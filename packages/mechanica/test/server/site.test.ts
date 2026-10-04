import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { SITE_MANIFEST_FILE, type SiteManifest } from 'mechanica-shared'
import { buildSiteManifest, configureSite, createEditorService, readSiteManifest } from '@/server'
import { readPage, savePage } from '@/server/pages-store'

const dirs: string[] = []
function tempMech(): string {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
  fs.mkdirSync(join(dir, 'pages'), { recursive: true })
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

/** A compiled block component, as the blocks module exposes it. */
const article = {
  blockId: 'article',
  __name: 'Article',
  blockSchema: { props: { title: { type: 'string', default: 'Untitled' }, body: 'richText' } },
}
const paragraph = (text: string) => [{ id: 'p', type: 'p', text }]

describe('buildSiteManifest', () => {
  it('describes compiled and composed blocks as JSON-safe data', () => {
    const manifest = buildSiteManifest({
      components: [article],
      composed: [{ id: 'promo', name: 'Promo', template: [] }],
      locales: { default: 'en', all: ['en', 'ru'] },
      engine: '9.9.9',
    })

    expect(manifest.format).toBe(1)
    expect(manifest.engine).toBe('9.9.9')
    expect(manifest.blocks.map((block) => block.id)).toEqual(['article', 'promo'])
    expect(manifest.blocks[1]!.composed).toBe(true)
    // Props are unfolded: the `richText` shorthand became a schema node.
    const props = manifest.blocks[0]!.props as { properties: Record<string, { format?: string }> }
    expect(props.properties.body!.format).toBe('richText')
    expect(manifest.generated).toEqual([])

    // What a host reads back from disk configures the stores just the same.
    const fromDisk = JSON.parse(JSON.stringify(manifest)) as SiteManifest
    expect(fromDisk.blocks[0]!.props).toEqual(manifest.blocks[0]!.props)
  })

  it('round-trips through dist/mechanica-site.json', () => {
    const dist = fs.mkdtempSync(join(os.tmpdir(), 'mech-dist-'))
    dirs.push(dist)
    expect(readSiteManifest(dist)).toBeNull()

    const manifest = buildSiteManifest({ components: [article] })
    fs.writeFileSync(join(dist, SITE_MANIFEST_FILE), JSON.stringify(manifest))
    expect(readSiteManifest(dist)!.blocks[0]!.id).toBe('article')

    fs.writeFileSync(join(dist, SITE_MANIFEST_FILE), JSON.stringify({ format: 2 }))
    expect(() => readSiteManifest(dist)).toThrow(/Unsupported/)
  })
})

describe('configureSite', () => {
  it('keeps each site to its own block schemas', () => {
    const withArticle = tempMech()
    const plain = tempMech()
    // From a manifest as a host would have it: parsed JSON, no components.
    configureSite(withArticle, JSON.parse(JSON.stringify(buildSiteManifest({ components: [article] }))))

    const content = [{ id: 'a', blockId: 'article', data: { title: 'Hi', body: paragraph('Hello') } }]
    savePage(withArticle, '/', { content, data: {} })
    savePage(plain, '/', { content, data: {} })

    // The configured site stores rich text as a Markdown region and reads it back as blocks…
    const stored = fs.readFileSync(join(withArticle, 'pages', 'index.page.md'), 'utf-8')
    expect(stored).toContain('Hello')
    expect(stored).not.toContain('"type"')
    const reread = readPage(withArticle, '/').content![0]!.data.body as { text?: string }[]
    expect(Array.isArray(reread)).toBe(true)

    // …while the other site, in the same process, knows nothing of that schema.
    expect(fs.readFileSync(join(plain, 'pages', 'index.page.md'), 'utf-8')).not.toBe(stored)
  })
})

describe('editor service over a manifest', () => {
  let mechDir: string
  const manifest: SiteManifest = {
    ...buildSiteManifest({
      components: [article],
      locales: { default: 'en', all: ['en', 'ru'] },
      generated: [{ path: '/shop/item', name: 'Item', content: [], data: {} } as never],
    }),
  }
  const call = (service: ReturnType<typeof createEditorService>, path: string, init?: RequestInit) =>
    service.handle(new Request(`http://host${path}`, init))

  beforeEach(() => {
    mechDir = tempMech()
  })

  it('lists blocks, fills schema defaults and guards generated pages', async () => {
    const service = createEditorService(mechDir, { site: manifest })

    expect(await (await call(service, '/blocks'))!.json()).toEqual([{ id: 'article', name: 'Article' }])

    await call(service, '/pages', { method: 'POST', body: JSON.stringify({ path: '/about', name: 'About' }) })
    await call(service, '/save?path=/about', {
      method: 'POST',
      body: JSON.stringify({ content: [{ id: 'a', blockId: 'article', data: {} }], pageData: {} }),
    })
    const state = (await (await call(service, '/state?path=/about'))!.json()) as {
      content: { data: { title: string } }[]
      locales: unknown
    }
    expect(state.content[0]!.data.title).toBe('Untitled')
    expect(state.locales).toEqual({ default: 'en', all: ['en', 'ru'] })

    // A generated page is listed and served, but never written.
    const pages = (await (await call(service, '/pages'))!.json()) as { path: string; generated?: boolean }[]
    expect(pages.find((page) => page.path === '/shop/item')?.generated).toBe(true)
    const save = await call(service, '/save?path=/shop/item', {
      method: 'POST',
      body: JSON.stringify({ content: [], pageData: {} }),
    })
    expect(save!.status).toBe(409)

    // The reserved-locale rule comes from the manifest's locales.
    const reserved = await call(service, '/pages', {
      method: 'POST',
      body: JSON.stringify({ path: '/ru', name: 'Ru' }),
    })
    expect(reserved!.status).toBe(400)
  })

  it('re-reads a manifest provider on every request', async () => {
    let current: SiteManifest = { format: 1, blocks: [], locales: null, generated: [] }
    const service = createEditorService(mechDir, { site: () => current })
    expect(await (await call(service, '/blocks'))!.json()).toEqual([])

    current = manifest
    expect(await (await call(service, '/blocks'))!.json()).toEqual([{ id: 'article', name: 'Article' }])
  })

  it('has no block listing without a manifest', async () => {
    expect((await call(createEditorService(mechDir), '/blocks'))!.status).toBe(503)
  })
})
