import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { serializePage, registerFieldSchemas, areFieldSchemasRegistered } from '@mechanica/shared'
import { exportProject, type SsrBundle } from '@/cli/export'

if (!areFieldSchemasRegistered()) registerFieldSchemas()

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(os.tmpdir(), 'mech-export-'))

  // A minimal `.mech` store: a root page, a nested page in a `blog` folder,
  // site data, and folder data that the nested page should inherit.
  await mkdir(join(dir, '.mech/pages/blog'), { recursive: true })
  await writeFile(join(dir, '.mech/data.json'), JSON.stringify({ site: { name: 'Acme' } }))
  await writeFile(join(dir, '.mech/folders.json'), JSON.stringify({ blog: { head: { title: 'Blog' } } }))
  await writeFile(
    join(dir, '.mech/pages/index.page.md'),
    serializePage({
      content: [{ id: '1', blockId: 'hero', data: { title: 'Welcome' } }],
      data: { head: { title: 'Home' } },
    }),
  )
  await writeFile(
    join(dir, '.mech/pages/blog/post.page.md'),
    serializePage({ content: [{ id: 'p', blockId: 'hero', data: { title: 'Post Body' } }], data: {} }),
  )

  // A built `dist`: the index template (with a head placeholder) + an asset.
  await mkdir(join(dir, 'dist/assets'), { recursive: true })
  await writeFile(
    join(dir, 'dist/index.html'),
    '<!doctype html><html><head><title>{{ head.title }}</title></head><body><div id="app"></div></body></html>',
  )
  await writeFile(join(dir, 'dist/assets/logo.png'), 'PNGDATA')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

// Stand in for the loaded `dist/ssr.js` bundle.
const ssr: SsrBundle = {
  blocksList: [
    { blockId: 'hero', __name: 'Hero', blockSchema: { name: 'Hero', props: { title: 'string' } } },
    { blockId: 'cta', __name: 'Cta', blockSchema: { name: 'CTA', props: { link: 'smartLink' } } },
    { blockId: 'pic', __name: 'Pic', blockSchema: { name: 'Pic', props: { image: 'image' } } },
  ],
  dataEntries: [
    { id: 'site', props: { type: 'object', properties: { name: { type: 'string' } } } },
    { id: 'head', props: { type: 'object', properties: { title: { type: 'string' } } } },
  ],
  render: (state: any) =>
    `<main data-site="${state.data.site?.name ?? ''}"><h1>${state.content[0]?.data?.title ?? ''}</h1></main>`,
}

describe('mechanica export (golden)', () => {
  it('renders every page with data scoping, head templating, and copied assets', async () => {
    const written = await exportProject(dir, ssr)
    expect([...written].sort()).toEqual(['/', '/blog/post'])

    const home = await readFile(join(dir, 'export/index.html'), 'utf-8')
    expect(home).toContain('<title>Home</title>') // page-scoped head data templated in
    // site data resolved + block rendered into #app
    expect(home).toContain('<div id="app"><main data-site="Acme"><h1>Welcome</h1></main></div>')
    expect(home).toContain('window.state=') // hydration state serialized

    const post = await readFile(join(dir, 'export/blog/post/index.html'), 'utf-8')
    expect(post).toContain('<title>Blog</title>') // folder-scoped data inherited (page didn't override)
    expect(post).toContain('<h1>Post Body</h1>')

    // Assets are copied alongside the generated HTML.
    expect(await readFile(join(dir, 'export/assets/logo.png'), 'utf-8')).toBe('PNGDATA')
  })

  it('returns an empty list when there are no pages', async () => {
    await rm(join(dir, '.mech/pages'), { recursive: true, force: true })
    expect(await exportProject(dir, ssr)).toEqual([])
  })

  it('warns about internal links pointing at missing pages', async () => {
    await writeFile(
      join(dir, '.mech/pages/links.page.md'),
      serializePage({
        content: [
          { id: 'ok', blockId: 'cta', data: { link: { url: '/blog/post' } } },
          { id: 'dead', blockId: 'cta', data: { link: { url: '/missing' } } },
          { id: 'ext', blockId: 'cta', data: { link: { url: 'https://x.com', external: true } } },
        ],
        data: {},
      }),
    )

    const warnings: string[] = []
    await exportProject(dir, ssr, { onWarn: (message) => warnings.push(message) })
    const broken = warnings.filter((w) => w.includes('Broken link'))
    expect(broken).toHaveLength(1)
    expect(broken[0]).toContain('/missing')
    expect(broken[0]).toContain('/links')
  })

  it('copies referenced uploads to /media and reports orphans', async () => {
    await mkdir(join(dir, '.mech/assets'), { recursive: true })
    await writeFile(join(dir, '.mech/assets/pic.png'), 'PIC')
    await writeFile(join(dir, '.mech/assets/orphan.png'), 'ORPHAN')
    await writeFile(
      join(dir, '.mech/pages/gallery.page.md'),
      serializePage({
        content: [{ id: 'g', blockId: 'pic', data: { image: { src: '/@mechanica/assets/pic.png' } } }],
        data: {},
      }),
    )

    const warnings: string[] = []
    await exportProject(dir, ssr, { onWarn: (message) => warnings.push(message) })

    // The referenced upload is copied and its URL rewritten in the state.
    expect(await readFile(join(dir, 'export/media/pic.png'), 'utf-8')).toBe('PIC')
    const gallery = await readFile(join(dir, 'export/gallery/index.html'), 'utf-8')
    expect(gallery).toContain('/media/pic.png')
    expect(gallery).not.toContain('/@mechanica/assets/')

    // The unreferenced one is reported, not copied.
    await expect(access(join(dir, 'export/media/orphan.png'))).rejects.toThrow()
    expect(warnings.some((w) => w.includes('orphan.png'))).toBe(true)
  })

  it('emits 404.html when a /404 page exists, and sitemap.xml with a site url', async () => {
    await writeFile(
      join(dir, '.mech/pages/404.page.md'),
      serializePage({ content: [{ id: 'n', blockId: 'hero', data: { title: 'Not found' } }], data: {} }),
    )

    await exportProject(dir, ssr, { siteUrl: 'https://example.com/' })

    const notFound = await readFile(join(dir, 'export/404.html'), 'utf-8')
    expect(notFound).toContain('Not found')

    const sitemap = await readFile(join(dir, 'export/sitemap.xml'), 'utf-8')
    expect(sitemap).toContain('<loc>https://example.com/</loc>')
    expect(sitemap).toContain('<loc>https://example.com/blog/post/</loc>')
    expect(sitemap).not.toContain('/404')
  })

  it('migrates old block data and warns about unknown blocks', async () => {
    const versioned: SsrBundle = {
      ...ssr,
      blocksList: [
        {
          blockId: 'hero',
          __name: 'Hero',
          blockSchema: {
            name: 'Hero',
            version: 2,
            props: { heading: 'string' },
            migrate(data: Record<string, unknown>, from: number) {
              if (from < 2) {
                data.heading = data.title
                delete data.title
              }
            },
          },
        },
      ],
      render: (state: any) => `<main><h1>${state.content[0]?.data?.heading ?? ''}</h1></main>`,
    }
    // index.page.md was written pre-migration: `title` instead of `heading`,
    // and blog/post references `hero`… plus a block type that no longer exists.
    await writeFile(
      join(dir, '.mech/pages/blog/post.page.md'),
      serializePage({ content: [{ id: 'x', blockId: 'retired', data: {} }], data: {} }),
    )

    const warnings: string[] = []
    await exportProject(dir, versioned, { onWarn: (message) => warnings.push(message) })

    const home = await readFile(join(dir, 'export/index.html'), 'utf-8')
    expect(home).toContain('<h1>Welcome</h1>') // migrated title → heading
    expect(home).toContain('"v":2') // stamped version in the hydration state

    expect(warnings.some((w) => w.includes('unknown block "retired"') && w.includes('/blog/post'))).toBe(true)
  })

  it('preloads each page’s block chunks from the build manifest', async () => {
    await mkdir(join(dir, 'dist/.vite'), { recursive: true })
    await writeFile(
      join(dir, 'dist/.vite/manifest.json'),
      JSON.stringify({
        'src/blocks/Hero.vue': { file: 'assets/Hero-a1.js', css: ['assets/Hero-a1.css'], imports: ['_shared.js'] },
        'src/blocks/Cta.vue': { file: 'assets/Cta-b2.js', css: ['assets/Cta-b2.css'] },
        '_shared.js': { file: 'assets/shared-x9.js' },
      }),
    )
    await writeFile(
      join(dir, 'dist/mechanica-blocks.json'),
      JSON.stringify({ hero: 'src/blocks/Hero.vue', cta: 'src/blocks/Cta.vue' }),
    )
    await writeFile(
      join(dir, '.mech/pages/contact.page.md'),
      serializePage({ content: [{ id: 'c', blockId: 'cta', data: { link: { url: '/' } } }], data: {} }),
    )

    await exportProject(dir, ssr)

    // The home page uses `hero` only: its chunk, css and shared import — no cta.
    const home = await readFile(join(dir, 'export/index.html'), 'utf-8')
    expect(home).toContain('<link rel="stylesheet" href="/assets/Hero-a1.css">')
    expect(home).toContain('<link rel="modulepreload" href="/assets/Hero-a1.js">')
    expect(home).toContain('<link rel="modulepreload" href="/assets/shared-x9.js">')
    expect(home).not.toContain('Cta-b2')

    const contact = await readFile(join(dir, 'export/contact/index.html'), 'utf-8')
    expect(contact).toContain('<link rel="stylesheet" href="/assets/Cta-b2.css">')
    expect(contact).toContain('<link rel="modulepreload" href="/assets/Cta-b2.js">')
    expect(contact).not.toContain('Hero-a1')
  })

  it('skips preload links when the build produced no manifest', async () => {
    await exportProject(dir, ssr)
    const home = await readFile(join(dir, 'export/index.html'), 'utf-8')
    expect(home).not.toContain('modulepreload')
  })

  it('fails loudly when index.html has no #app container', async () => {
    await writeFile(join(dir, 'dist/index.html'), '<!doctype html><html><body></body></html>')
    await expect(exportProject(dir, ssr)).rejects.toThrow(/id="app"/)
  })
})
