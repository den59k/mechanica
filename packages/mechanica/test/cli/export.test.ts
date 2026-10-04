import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { registerFieldSchemas, areFieldSchemasRegistered } from 'mechanica-shared'
import { serializePage } from 'mechanica-shared/page-format'
import { exportBuilt, exportProject, type SsrBundle } from '@/cli/export'
import { setSharpModule } from '@/server/image-preview'

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

// A render stub with the new contract: on /news (and its variants) it runs a
// paginated query through the provided resolver and reports what it resolved.
const NEWS_KEY = 'getPages.' + JSON.stringify({ folderName: 'posts', sort: { by: 'name' }, pageSize: 2 })
const paginatedSsr: SsrBundle = {
  ...ssr,
  render: async (state: any, context: any = {}) => {
    const path: string = state.page?.path ?? ''
    if (!context.resolveQuery || (path !== '/news' && !path.startsWith('/news/'))) {
      return { html: '<main></main>', query: {} }
    }
    const result = (await context.resolveQuery(NEWS_KEY)) as {
      items: { name: string }[]
      page: number
      pageCount: number
    }
    const list = result.items.map((item) => `<li>${item.name}</li>`).join('')
    return {
      html: `<main><ul>${list}</ul><nav>page ${result.page} of ${result.pageCount}</nav></main>`,
      query: { [NEWS_KEY]: result },
    }
  },
}

const writePosts = async (count: number) => {
  await mkdir(join(dir, '.mech/pages/posts'), { recursive: true })
  for (let i = 0; i < count; i++) {
    const name = String.fromCharCode(97 + i) // a, b, c…
    await writeFile(
      join(dir, `.mech/pages/posts/${name}.page.md`),
      serializePage({ content: [], data: {}, name: `Post ${name.toUpperCase()}` }),
    )
  }
  await writeFile(
    join(dir, '.mech/pages/news.page.md'),
    serializePage({
      content: [{ id: 'n', blockId: 'hero', data: { title: 'News' } }],
      data: { head: { title: 'News' } },
    }),
  )
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

  it('skips draft pages — no HTML, no sitemap entry', async () => {
    await writeFile(
      join(dir, '.mech/pages/wip.page.md'),
      serializePage({
        content: [{ id: 'w', blockId: 'hero', data: { title: 'Not ready' } }],
        data: {},
        draft: true,
      }),
    )

    const written = await exportProject(dir, ssr, { siteUrl: 'https://acme.test' })
    expect(written).not.toContain('/wip')
    await expect(access(join(dir, 'export/wip/index.html'))).rejects.toBeTruthy()

    const sitemap = await readFile(join(dir, 'export/sitemap.xml'), 'utf-8')
    expect(sitemap).not.toContain('/wip/')
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

  it('copies an upload referenced at /media — the address it keeps on the exported site', async () => {
    await mkdir(join(dir, '.mech/assets'), { recursive: true })
    await writeFile(join(dir, '.mech/assets/pic-0a1b2c3d.png'), 'PIC')
    await writeFile(
      join(dir, '.mech/pages/gallery.page.md'),
      serializePage({
        content: [{ id: 'g', blockId: 'pic', data: { image: { src: '/media/pic-0a1b2c3d.png' } } }],
        data: {},
      }),
    )

    const warnings: string[] = []
    await exportProject(dir, ssr, { onWarn: (message) => warnings.push(message) })

    expect(await readFile(join(dir, 'export/media/pic-0a1b2c3d.png'), 'utf-8')).toBe('PIC')
    expect(await readFile(join(dir, 'export/gallery/index.html'), 'utf-8')).toContain('/media/pic-0a1b2c3d.png')
    expect(warnings.filter((w) => w.includes('upload'))).toEqual([])
  })

  it('serves /assets and /media from a CDN base with assetsUrl, still copying files locally', async () => {
    // A build asset referenced by the template, and an uploaded image on a page.
    await writeFile(
      join(dir, 'dist/index.html'),
      '<!doctype html><html><head><title>{{ head.title }}</title>' +
        '<script type="module" src="/assets/entry.js"></script>' +
        '</head><body><div id="app"></div></body></html>',
    )
    await writeFile(join(dir, 'dist/assets/entry.js'), 'ENTRY')
    await mkdir(join(dir, '.mech/assets'), { recursive: true })
    await writeFile(join(dir, '.mech/assets/pic.png'), 'PIC')
    await writeFile(
      join(dir, '.mech/pages/gallery.page.md'),
      serializePage({
        content: [{ id: 'g', blockId: 'pic', data: { image: { src: '/@mechanica/assets/pic.png' } } }],
        data: {},
      }),
    )

    await exportProject(dir, ssr, { assetsUrl: 'https://cdn.example.com/' })

    // Uploaded media points at the CDN (trailing slash trimmed, folder kept).
    const gallery = await readFile(join(dir, 'export/gallery/index.html'), 'utf-8')
    expect(gallery).toContain('https://cdn.example.com/media/pic.png')
    expect(gallery).not.toContain('"/media/pic.png"') // no root-relative form left
    // The build-asset tag is prefixed too.
    const home = await readFile(join(dir, 'export/index.html'), 'utf-8')
    expect(home).toContain('src="https://cdn.example.com/assets/entry.js"')

    // Files still land in export/ for the CI upload step.
    expect(await readFile(join(dir, 'export/media/pic.png'), 'utf-8')).toBe('PIC')
    expect(await readFile(join(dir, 'export/assets/entry.js'), 'utf-8')).toBe('ENTRY')
  })

  it('reads assetsUrl baked into the SSR bundle, with the CLI flag overriding', async () => {
    await mkdir(join(dir, '.mech/assets'), { recursive: true })
    await writeFile(join(dir, '.mech/assets/pic.png'), 'PIC')
    await writeFile(
      join(dir, '.mech/pages/gallery.page.md'),
      serializePage({
        content: [{ id: 'g', blockId: 'pic', data: { image: { src: '/@mechanica/assets/pic.png' } } }],
        data: {},
      }),
    )

    const bundled: SsrBundle = { ...ssr, assetsUrl: 'https://bundled.cdn' }
    await exportProject(dir, bundled)
    expect(await readFile(join(dir, 'export/gallery/index.html'), 'utf-8')).toContain(
      'https://bundled.cdn/media/pic.png',
    )

    await exportProject(dir, bundled, { assetsUrl: 'https://flag.cdn' })
    const overridden = await readFile(join(dir, 'export/gallery/index.html'), 'utf-8')
    expect(overridden).toContain('https://flag.cdn/media/pic.png')
    expect(overridden).not.toContain('bundled.cdn')
  })

  it('copies a referenced crop derivative and never warns about stale ones', async () => {
    await mkdir(join(dir, '.mech/assets'), { recursive: true })
    await writeFile(join(dir, '.mech/assets/hero.png'), 'HERO')
    await writeFile(join(dir, '.mech/assets/hero.crop-live.webp'), 'CROP')
    // A leftover derivative from an earlier crop — regenerable cache, not source.
    await writeFile(join(dir, '.mech/assets/hero.crop-stale.webp'), 'OLD')
    await writeFile(
      join(dir, '.mech/pages/gallery.page.md'),
      serializePage({
        content: [
          {
            id: 'g',
            blockId: 'pic',
            data: {
              image: {
                src: '/@mechanica/assets/hero.png',
                crop: { x: 0, y: 0.25, width: 1, height: 0.5 },
                croppedSrc: '/@mechanica/assets/hero.crop-live.webp',
                croppedWidth: 500,
                croppedHeight: 250,
              },
            },
          },
        ],
        data: {},
      }),
    )

    const warnings: string[] = []
    await exportProject(dir, ssr, { onWarn: (message) => warnings.push(message) })

    // The referenced derivative is copied and its URL rewritten to /media.
    expect(await readFile(join(dir, 'export/media/hero.crop-live.webp'), 'utf-8')).toBe('CROP')
    const gallery = await readFile(join(dir, 'export/gallery/index.html'), 'utf-8')
    expect(gallery).toContain('/media/hero.crop-live.webp')

    // The stale derivative isn't copied, but — unlike a real orphan — isn't warned.
    await expect(access(join(dir, 'export/media/hero.crop-stale.webp'))).rejects.toThrow()
    expect(warnings.some((w) => w.includes('crop-stale'))).toBe(false)
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
      JSON.stringify({
        hero: { src: 'src/blocks/Hero.vue', chunk: 'assets/Hero-a1.js' },
        cta: { src: 'src/blocks/Cta.vue', chunk: 'assets/Cta-b2.js' },
      }),
    )
    await writeFile(
      join(dir, '.mech/pages/contact.page.md'),
      serializePage({ content: [{ id: 'c', blockId: 'cta', data: { link: { url: '/' } } }], data: {} }),
    )

    await exportProject(dir, ssr)

    // The home page uses `hero` only: its chunk, css and shared import — no cta.
    const home = await readFile(join(dir, 'export/index.html'), 'utf-8')
    expect(home).toContain('<link rel="stylesheet" crossorigin href="/assets/Hero-a1.css">')
    expect(home).toContain('<link rel="modulepreload" crossorigin href="/assets/Hero-a1.js">')
    expect(home).toContain('<link rel="modulepreload" crossorigin href="/assets/shared-x9.js">')
    expect(home).not.toContain('Cta-b2')

    const contact = await readFile(join(dir, 'export/contact/index.html'), 'utf-8')
    expect(contact).toContain('<link rel="stylesheet" crossorigin href="/assets/Cta-b2.css">')
    expect(contact).toContain('<link rel="modulepreload" crossorigin href="/assets/Cta-b2.js">')
    expect(contact).not.toContain('Hero-a1')
  })

  it('points block preloads at the CDN base too, for any asset dir name', async () => {
    // A build with a renamed assets dir (Vite `build.assetsDir: 'landing-assets'`).
    await mkdir(join(dir, 'dist/.vite'), { recursive: true })
    await writeFile(
      join(dir, 'dist/.vite/manifest.json'),
      JSON.stringify({
        'src/blocks/Hero.vue': { file: 'landing-assets/Hero-a1.js', css: ['landing-assets/Hero-a1.css'] },
      }),
    )
    await writeFile(
      join(dir, 'dist/mechanica-blocks.json'),
      JSON.stringify({ hero: { src: 'src/blocks/Hero.vue', chunk: 'landing-assets/Hero-a1.js' } }),
    )

    await exportProject(dir, ssr, { assetsUrl: 'https://cdn.le.codes' })

    // The home page uses `hero`: its preloads point at the CDN, folder and all —
    // not the literal `/assets/`, proving it isn't tied to the default dir name.
    const home = await readFile(join(dir, 'export/index.html'), 'utf-8')
    expect(home).toContain('<link rel="stylesheet" crossorigin href="https://cdn.le.codes/landing-assets/Hero-a1.css">')
    expect(home).toContain('<link rel="modulepreload" crossorigin href="https://cdn.le.codes/landing-assets/Hero-a1.js">')
    expect(home).not.toContain('href="/landing-assets/')
  })

  it('splits a paginated page into real /news/2… variants, each with its own slice', async () => {
    await writePosts(5)

    const written = await exportProject(dir, paginatedSsr, { siteUrl: 'https://example.com' })
    expect(written).toContain('/news')
    expect(written).toContain('/news/2')
    expect(written).toContain('/news/3')
    expect(written).not.toContain('/news/4')

    const first = await readFile(join(dir, 'export/news/index.html'), 'utf-8')
    expect(first).toContain('<li>Post A</li>')
    expect(first).toContain('<li>Post B</li>')
    expect(first).not.toContain('<li>Post C</li>')
    expect(first).toContain('"query"') // slice baked for client hydration
    expect(first).toContain('"page":{"path":"/news"}')

    const second = await readFile(join(dir, 'export/news/2/index.html'), 'utf-8')
    expect(second).toContain('<li>Post C</li>')
    expect(second).toContain('<li>Post D</li>')
    expect(second).not.toContain('<li>Post A</li>')
    expect(second).toContain('page 2 of 3')
    expect(second).toContain('"pagination":{"page":2,"pageCount":3}')

    const third = await readFile(join(dir, 'export/news/3/index.html'), 'utf-8')
    expect(third).toContain('<li>Post E</li>')

    // Variants are first-class pages in the sitemap.
    const sitemap = await readFile(join(dir, 'export/sitemap.xml'), 'utf-8')
    expect(sitemap).toContain('<loc>https://example.com/news/2/</loc>')
  })

  it('fails loudly when a real page occupies a variant path', async () => {
    await writePosts(5)
    // /news needs /news/2 — but the store has an actual page there. The /news
    // page itself must move to posts-style folder layout for this to happen.
    await mkdir(join(dir, '.mech/pages/news'), { recursive: true })
    await rm(join(dir, '.mech/pages/news.page.md'))
    await writeFile(
      join(dir, '.mech/pages/news/index.page.md'),
      serializePage({ content: [], data: {}, name: 'News' }),
    )
    await writeFile(join(dir, '.mech/pages/news/2.page.md'), serializePage({ content: [], data: {}, name: 'Two' }))

    await expect(exportProject(dir, paginatedSsr)).rejects.toThrow(/\/news\/2/)
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

describe('mechanica export (SEO)', () => {
  it('injects canonical/og:url, absolutizes social images, emits robots.txt and lastmod', async () => {
    await writeFile(
      join(dir, 'dist/index.html'),
      '<!doctype html><html><head><title>{{ head.title }}</title>' +
        '<meta property="og:image" content="/media/cover.jpg">' +
        '</head><body><div id="app"></div></body></html>',
    )

    await exportProject(dir, ssr, { siteUrl: 'https://acme.test' })

    const home = await readFile(join(dir, 'export/index.html'), 'utf-8')
    expect(home).toContain('<link rel="canonical" href="https://acme.test/">')
    expect(home).toContain('<meta property="og:url" content="https://acme.test/">')
    expect(home).toContain('<meta property="og:image" content="https://acme.test/media/cover.jpg">')

    const post = await readFile(join(dir, 'export/blog/post/index.html'), 'utf-8')
    expect(post).toContain('<link rel="canonical" href="https://acme.test/blog/post/">')

    const robots = await readFile(join(dir, 'export/robots.txt'), 'utf-8')
    expect(robots).toContain('Sitemap: https://acme.test/sitemap.xml')

    const sitemap = await readFile(join(dir, 'export/sitemap.xml'), 'utf-8')
    expect(sitemap).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/)
  })

  it('templates {{ page.path }} in the head — identically to dev', async () => {
    await writeFile(
      join(dir, 'dist/index.html'),
      '<!doctype html><html><head><link rel="canonical" href="{{ site.url }}{{ page.path }}/">' +
        '</head><body><div id="app"></div></body></html>',
    )
    await exportProject(dir, ssr, { siteUrl: 'https://acme.test' })
    const post = await readFile(join(dir, 'export/blog/post/index.html'), 'utf-8')
    // The hand-authored canonical resolved — and the automatic one stood down.
    expect(post).toContain('<link rel="canonical" href="https://acme.test/blog/post/">')
    expect(post.match(/rel="canonical"/g)).toHaveLength(1)
  })

  it('reads site config baked into the SSR bundle, with CLI flags overriding', async () => {
    const bundled: SsrBundle = { ...ssr, site: { url: 'https://bundled.test', name: 'Bundled' } }
    await exportProject(dir, bundled)
    const home = await readFile(join(dir, 'export/index.html'), 'utf-8')
    expect(home).toContain('<link rel="canonical" href="https://bundled.test/">')
    expect(home).toContain('"@type":"WebSite"') // root page gets WebSite JSON-LD
    expect(home).toContain('"name":"Bundled"')

    await exportProject(dir, bundled, { siteUrl: 'https://flag.test' })
    const overridden = await readFile(join(dir, 'export/index.html'), 'utf-8')
    expect(overridden).toContain('<link rel="canonical" href="https://flag.test/">')
  })

  it('honors meta.noindex and auto-noindexes /404 — robots meta + sitemap exclusion', async () => {
    await writeFile(
      join(dir, '.mech/pages/secret.page.md'),
      serializePage({ content: [], data: {}, meta: { noindex: true } }),
    )
    await writeFile(
      join(dir, '.mech/pages/404.page.md'),
      serializePage({ content: [{ id: 'n', blockId: 'hero', data: { title: 'Not found' } }], data: {} }),
    )

    await exportProject(dir, ssr, { siteUrl: 'https://acme.test' })

    const secret = await readFile(join(dir, 'export/secret/index.html'), 'utf-8')
    expect(secret).toContain('<meta name="robots" content="noindex">')
    const notFound = await readFile(join(dir, 'export/404.html'), 'utf-8')
    expect(notFound).toContain('<meta name="robots" content="noindex">')

    const sitemap = await readFile(join(dir, 'export/sitemap.xml'), 'utf-8')
    expect(sitemap).not.toContain('/secret/')
    expect(sitemap).not.toContain('/404')
  })

  it('lets meta.lastmod override the page file mtime', async () => {
    await writeFile(
      join(dir, '.mech/pages/dated.page.md'),
      serializePage({ content: [], data: {}, meta: { lastmod: '2020-01-02' } }),
    )
    await exportProject(dir, ssr, { siteUrl: 'https://acme.test' })
    const sitemap = await readFile(join(dir, 'export/sitemap.xml'), 'utf-8')
    expect(sitemap).toContain('<url><loc>https://acme.test/dated/</loc><lastmod>2020-01-02</lastmod></url>')
  })

  it('ships public/ files from dist but keeps build-private artifacts out', async () => {
    await writeFile(join(dir, 'dist/favicon.ico'), 'ICO')
    await mkdir(join(dir, 'dist/fonts'), { recursive: true })
    await writeFile(join(dir, 'dist/fonts/inter.woff2'), 'FONT')
    await writeFile(join(dir, 'dist/ssr.js'), 'export {}')
    await writeFile(join(dir, 'dist/mechanica-blocks.json'), '{}')
    await writeFile(join(dir, 'dist/robots.txt'), 'User-agent: *\nDisallow: /private/\n')

    await exportProject(dir, ssr, { siteUrl: 'https://acme.test' })

    expect(await readFile(join(dir, 'export/favicon.ico'), 'utf-8')).toBe('ICO')
    expect(await readFile(join(dir, 'export/fonts/inter.woff2'), 'utf-8')).toBe('FONT')
    await expect(access(join(dir, 'export/ssr.js'))).rejects.toBeTruthy()
    await expect(access(join(dir, 'export/mechanica-blocks.json'))).rejects.toBeTruthy()
    // The site's own robots.txt (from public/) wins over the generated default.
    expect(await readFile(join(dir, 'export/robots.txt'), 'utf-8')).toContain('Disallow: /private/')
  })

  it('gives paginated variants distinct titles plus prev/next and canonical links', async () => {
    await writePosts(5)

    await exportProject(dir, paginatedSsr, { siteUrl: 'https://acme.test' })

    const first = await readFile(join(dir, 'export/news/index.html'), 'utf-8')
    expect(first).toContain('<title>News</title>')
    expect(first).toContain('<link rel="next" href="https://acme.test/news/2/">')
    expect(first).not.toContain('rel="prev"')

    const second = await readFile(join(dir, 'export/news/2/index.html'), 'utf-8')
    expect(second).toContain('<title>News — Page 2</title>')
    expect(second).toContain('<link rel="canonical" href="https://acme.test/news/2/">')
    expect(second).toContain('<link rel="prev" href="https://acme.test/news/">')
    expect(second).toContain('<link rel="next" href="https://acme.test/news/3/">')

    const third = await readFile(join(dir, 'export/news/3/index.html'), 'utf-8')
    expect(third).toContain('<title>News — Page 3</title>')
    expect(third).not.toContain('rel="next"')
  })

  it('emits BreadcrumbList JSON-LD from the page trail, named by editor labels', async () => {
    await writeFile(
      join(dir, '.mech/pages/blog/index.page.md'),
      serializePage({ content: [], data: {}, name: 'Blog' }),
    )
    await writeFile(
      join(dir, '.mech/pages/blog/post.page.md'),
      serializePage({ content: [], data: {}, name: 'My Post' }),
    )

    await exportProject(dir, ssr, { siteUrl: 'https://acme.test' })

    const post = await readFile(join(dir, 'export/blog/post/index.html'), 'utf-8')
    expect(post).toContain('"@type":"BreadcrumbList"')
    expect(post).toContain('"position":1,"name":"Home","item":"https://acme.test/"')
    expect(post).toContain('"position":2,"name":"Blog","item":"https://acme.test/blog/"')
    expect(post).toContain('"position":3,"name":"My Post","item":"https://acme.test/blog/post/"')
    // The root page has no trail.
    const home = await readFile(join(dir, 'export/index.html'), 'utf-8')
    expect(home).not.toContain('BreadcrumbList')
  })

  it('backfills missing image previewSrc + dimensions via optional sharp', async () => {
    setSharpModule(((_buffer: Buffer) => ({
      metadata: async () => ({ width: 900, height: 450 }),
      resize: () => ({ webp: () => ({ toBuffer: async () => Buffer.from('preview') }) }),
    })) as never)
    try {
      await mkdir(join(dir, '.mech/assets'), { recursive: true })
      await writeFile(join(dir, '.mech/assets/old.png'), 'PNG')
      await writeFile(
        join(dir, '.mech/pages/gallery.page.md'),
        serializePage({
          // Authored before capture existed: src only, no preview/dimensions.
          content: [{ id: 'g', blockId: 'pic', data: { image: { src: '/@mechanica/assets/old.png' } } }],
          data: {},
        }),
      )

      await exportProject(dir, ssr)

      const gallery = await readFile(join(dir, 'export/gallery/index.html'), 'utf-8')
      const lqip = `data:image/webp;base64,${Buffer.from('preview').toString('base64')}`
      expect(gallery).toContain(`"previewSrc":"${lqip}"`)
      expect(gallery).toContain('"width":900')
      expect(gallery).toContain('"height":450')
      expect(gallery).toContain('"src":"/media/old.png"') // rewrite still applies

      // The computed analysis is cached into the manifest for dev + next runs.
      const manifest = JSON.parse(await readFile(join(dir, '.mech/images.json'), 'utf-8'))
      expect(manifest['old.png']).toEqual({ width: 900, height: 450, previewSrc: lqip })
    } finally {
      setSharpModule(undefined)
    }
  })

  it('fills image metadata from .mech/images.json — no sharp needed', async () => {
    setSharpModule(null)
    try {
      await mkdir(join(dir, '.mech/assets'), { recursive: true })
      await writeFile(join(dir, '.mech/assets/old.png'), 'PNG')
      await writeFile(
        join(dir, '.mech/images.json'),
        JSON.stringify({ 'old.png': { width: 320, height: 240, previewSrc: 'data:image/webp;base64,manifested' } }),
      )
      await writeFile(
        join(dir, '.mech/pages/gallery.page.md'),
        serializePage({
          content: [{ id: 'g', blockId: 'pic', data: { image: { src: '/@mechanica/assets/old.png' } } }],
          data: {},
        }),
      )

      const warnings: string[] = []
      await exportProject(dir, ssr, { onWarn: (message) => warnings.push(message) })

      const gallery = await readFile(join(dir, 'export/gallery/index.html'), 'utf-8')
      expect(gallery).toContain('"previewSrc":"data:image/webp;base64,manifested"')
      expect(gallery).toContain('"width":320')
      expect(warnings.some((w) => w.includes('lack a preview'))).toBe(false)
    } finally {
      setSharpModule(undefined)
    }
  })

  it('leaves complete image values alone and hints at sharp when it is missing', async () => {
    setSharpModule(null) // simulate: optional dependency not installed
    try {
      await mkdir(join(dir, '.mech/assets'), { recursive: true })
      await writeFile(join(dir, '.mech/assets/a.png'), 'PNG')
      await writeFile(join(dir, '.mech/assets/b.png'), 'PNG')
      await writeFile(
        join(dir, '.mech/pages/gallery.page.md'),
        serializePage({
          content: [
            // Complete (captured in the editor) — nothing to backfill.
            {
              id: 'done',
              blockId: 'pic',
              data: {
                image: { src: '/@mechanica/assets/a.png', previewSrc: 'data:image/webp;base64,ed', width: 10, height: 20 },
              },
            },
            // Incomplete — would need sharp.
            { id: 'todo', blockId: 'pic', data: { image: { src: '/@mechanica/assets/b.png' } } },
          ],
          data: {},
        }),
      )

      const warnings: string[] = []
      await exportProject(dir, ssr, { onWarn: (message) => warnings.push(message) })

      const gallery = await readFile(join(dir, 'export/gallery/index.html'), 'utf-8')
      expect(gallery).toContain('"previewSrc":"data:image/webp;base64,ed"')
      expect(gallery).toContain('"width":10')
      expect(warnings.some((w) => w.includes('1 image(s)') && w.includes('sharp'))).toBe(true)
    } finally {
      setSharpModule(undefined)
    }
  })

  it('warns about page-level SEO issues and duplicate titles', async () => {
    const imgSsr: SsrBundle = { ...ssr, render: () => '<main><h1>x</h1><img src="/a.jpg"></main>' }
    await writeFile(
      join(dir, '.mech/pages/a.page.md'),
      serializePage({ content: [], data: { head: { title: 'Same' } } }),
    )
    await writeFile(
      join(dir, '.mech/pages/b.page.md'),
      serializePage({ content: [], data: { head: { title: 'Same' } } }),
    )

    const warnings: string[] = []
    await exportProject(dir, imgSsr, { onWarn: (message) => warnings.push(message) })

    expect(warnings.some((w) => w.includes('SEO on /a') && w.includes('no meta description'))).toBe(true)
    expect(warnings.some((w) => w.includes('<img> without alt text'))).toBe(true)
    const duplicate = warnings.find((w) => w.includes('share the title "Same"'))
    expect(duplicate).toContain('/a')
    expect(duplicate).toContain('/b')
  })
})

describe('mechanica export (i18n)', () => {
  const i18nSsr: SsrBundle = {
    ...ssr,
    site: { url: 'https://x.com', name: 'Acme' },
    locales: { default: 'en', all: ['en', 'ru'] },
  }

  it('renders each translation at its locale-prefixed path with hreflang + lang', async () => {
    await writeFile(
      join(dir, '.mech/pages/about.page.md'),
      serializePage({ content: [{ id: 'a', blockId: 'hero', data: { title: 'About EN' } }], data: {} }),
    )
    await writeFile(
      join(dir, '.mech/pages/about@ru.page.md'),
      serializePage({ content: [{ id: 'a', blockId: 'hero', data: { title: 'About RU' } }], data: {} }),
    )

    const written = await exportProject(dir, i18nSsr)
    expect(written).toContain('/about')
    expect(written).toContain('/ru/about')

    const ru = await readFile(join(dir, 'export/ru/about/index.html'), 'utf-8')
    expect(ru).toContain('<h1>About RU</h1>')
    expect(ru).toContain('<html lang="ru">')
    expect(ru).toContain('<link rel="canonical" href="https://x.com/ru/about/">')
    expect(ru).toContain('<link rel="alternate" hreflang="x-default" href="https://x.com/about/">')
    expect(ru).toContain('<link rel="alternate" hreflang="ru" href="https://x.com/ru/about/">')

    const en = await readFile(join(dir, 'export/about/index.html'), 'utf-8')
    expect(en).toContain('<h1>About EN</h1>')
    expect(en).toContain('<html lang="en">')
    expect(en).toContain('<link rel="alternate" hreflang="ru" href="https://x.com/ru/about/">')

    // The sitemap carries xhtml alternates for the translated page.
    const sitemap = await readFile(join(dir, 'export/sitemap.xml'), 'utf-8')
    expect(sitemap).toContain('xmlns:xhtml')
    expect(sitemap).toContain('<xhtml:link rel="alternate" hreflang="ru" href="https://x.com/ru/about/"/>')
  })

  it('skips untranslated pages and warns per locale (no /ru output, no alternates)', async () => {
    await writeFile(
      join(dir, '.mech/pages/solo.page.md'),
      serializePage({ content: [{ id: 's', blockId: 'hero', data: { title: 'Solo' } }], data: {} }),
    )

    const warnings: string[] = []
    const written = await exportProject(dir, i18nSsr, { onWarn: (m) => warnings.push(m) })

    expect(written).not.toContain('/ru/solo')
    await expect(access(join(dir, 'export/ru/solo/index.html'))).rejects.toBeTruthy()
    expect(warnings.some((w) => w.includes('locale "ru" is missing') && w.includes('/solo'))).toBe(true)

    // A single-locale page emits no hreflang alternates.
    const solo = await readFile(join(dir, 'export/solo/index.html'), 'utf-8')
    expect(solo).not.toContain('hreflang')
  })

  it('renders localized site data (data.<locale>.json) into the translation', async () => {
    // A block that echoes the site name so we can see which locale's data won.
    await writeFile(
      join(dir, '.mech/pages/about.page.md'),
      serializePage({ content: [{ id: 'a', blockId: 'hero', data: { title: 'About' } }], data: {} }),
    )
    await writeFile(
      join(dir, '.mech/pages/about@ru.page.md'),
      serializePage({ content: [{ id: 'a', blockId: 'hero', data: { title: 'About' } }], data: {} }),
    )
    // Base site data + a ru override of the localized `site.name`.
    await writeFile(join(dir, '.mech/data.json'), JSON.stringify({ site: { name: 'Acme' } }))
    await writeFile(join(dir, '.mech/data.ru.json'), JSON.stringify({ site: { name: 'Акме' } }))

    await exportProject(dir, i18nSsr)

    // The render stub puts state.data.site.name into a data-site attribute.
    const en = await readFile(join(dir, 'export/about/index.html'), 'utf-8')
    expect(en).toContain('data-site="Acme"')
    const ru = await readFile(join(dir, 'export/ru/about/index.html'), 'utf-8')
    expect(ru).toContain('data-site="Акме"')
  })

  it('resolves a translated listing per locale — only translated pages, translated names', async () => {
    await writePosts(3) // posts a, b, c (en) + a /news listing page
    // Translate the /news page and posts a, b to ru (with Russian names); c stays en-only.
    for (const p of ['a', 'b']) {
      await writeFile(
        join(dir, `.mech/pages/posts/${p}@ru.page.md`),
        serializePage({ content: [], data: {}, name: `Пост ${p.toUpperCase()}` }),
      )
    }
    await writeFile(
      join(dir, '.mech/pages/news@ru.page.md'),
      serializePage({
        content: [{ id: 'n', blockId: 'hero', data: { title: 'Новости' } }],
        data: { head: { title: 'Новости' } },
      }),
    )

    const i18nPaginated: SsrBundle = {
      ...paginatedSsr,
      site: { url: 'https://x.com' },
      locales: { default: 'en', all: ['en', 'ru'] },
    }
    await exportProject(dir, i18nPaginated)

    // The ru /news lists only the ru-translated posts, by their Russian names.
    const ruNews = await readFile(join(dir, 'export/ru/news/index.html'), 'utf-8')
    expect(ruNews).toContain('<li>Пост A</li>')
    expect(ruNews).toContain('<li>Пост B</li>')
    expect(ruNews).not.toContain('Post C') // untranslated → not listed (and not rendered)

    // The default /news counts all three English posts (page 1 of 2, pageSize 2).
    const enNews = await readFile(join(dir, 'export/news/index.html'), 'utf-8')
    expect(enNews).toContain('<li>Post A</li>')
    expect(enNews).toContain('page 1 of 2')
    // The ru listing is a single page (only 2 translated posts) — no /ru/news/2.
    await expect(access(join(dir, 'export/ru/news/2/index.html'))).rejects.toBeTruthy()
  })
})

describe('mechanica export (generated pages)', () => {
  it('renders programmatic routes that have no page file', async () => {
    const generated: SsrBundle = {
      ...ssr,
      generatedPages: [
        { path: '/docs/api', content: [{ id: 'g', blockId: 'hero', data: { title: 'API' } }], data: { head: { title: 'API Reference' } }, meta: { title: 'API' } },
        { path: '/docs/api/mathf', content: [{ id: 'g', blockId: 'hero', data: { title: 'Mathf' } }], data: { head: { title: 'Mathf' } }, meta: { title: 'Mathf' }, lastmod: '2026-01-02' },
      ],
    }
    const written = await exportProject(dir, generated, { onWarn: () => {} })
    expect(written).toContain('/docs/api')
    expect(written).toContain('/docs/api/mathf')

    const page = await readFile(join(dir, 'export/docs/api/mathf/index.html'), 'utf-8')
    expect(page).toContain('<title>Mathf</title>') // generated page's head data templated in
    expect(page).toContain('<h1>Mathf</h1>') // its block rendered through the pipeline
    expect(page).toContain('window.state=') // hydration state serialized like any page
  })

  it('makes generated routes valid internal-link targets (no broken-link warning)', async () => {
    // The home page links to a generated route; without generatedPages it'd warn.
    await writeFile(
      join(dir, '.mech/pages/index.page.md'),
      serializePage({
        content: [{ id: '1', blockId: 'cta', data: { link: { id: 'x', url: '/docs/api', title: 'API' } } }],
        data: { head: { title: 'Home' } },
      }),
    )
    const warnings: string[] = []
    await exportProject(
      dir,
      { ...ssr, generatedPages: [{ path: '/docs/api', content: [], data: {}, meta: { title: 'API' } }] },
      { onWarn: (m) => warnings.push(m) },
    )
    expect(warnings.filter((w) => w.includes('Broken link'))).toEqual([])
  })

  it('emits hreflang alternates + localized paths for a multi-language generated route', async () => {
    const gen: SsrBundle = {
      ...ssr,
      locales: { default: 'en', all: ['en', 'ru'] },
      generatedPages: [
        { path: '/docs/api', locale: 'en', locales: ['en', 'ru'], content: [], data: { head: { title: 'API' } }, meta: { title: 'API' } },
        { path: '/docs/api', locale: 'ru', locales: ['en', 'ru'], content: [], data: { head: { title: 'API' } }, meta: { title: 'API' } },
      ],
    }
    const written = await exportProject(dir, gen, { siteUrl: 'https://x.dev', onWarn: () => {} })
    expect(written).toContain('/docs/api') // default locale, unprefixed
    expect(written).toContain('/ru/docs/api') // non-default, prefixed
    const en = await readFile(join(dir, 'export/docs/api/index.html'), 'utf-8')
    expect(en).toContain('hreflang="ru"')
    expect(en).toContain('/ru/docs/api')
  })

  it('throws when a generated path collides with an authored page', async () => {
    const clash: SsrBundle = { ...ssr, generatedPages: [{ path: '/', content: [], data: {} }] }
    await expect(exportProject(dir, clash, { onWarn: () => {} })).rejects.toThrow(/already exists/)
  })
})

describe('layout + 404 lint', () => {
  it('warns on an unknown layout once per logical page, naming the fallback', async () => {
    await writeFile(
      join(dir, '.mech/pages/oops.page.md'),
      serializePage({ content: [], data: {}, layout: 'documentation' }),
    )
    const warnings: string[] = []
    await exportProject(dir, { ...ssr, layoutNames: ['site', 'docs'] }, { onWarn: (m) => warnings.push(m) })
    const hits = warnings.filter((w) => w.includes('unknown layout'))
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain('/oops')
    expect(hits[0]).toContain('"documentation"')
    expect(hits[0]).toContain('falls back to "site"')
    expect(hits[0]).toContain('site, docs')
  })

  it('warns when a page sets a layout but the app declares none', async () => {
    await writeFile(
      join(dir, '.mech/pages/oops.page.md'),
      serializePage({ content: [], data: {}, layout: 'docs' }),
    )
    const warnings: string[] = []
    await exportProject(dir, { ...ssr, layoutNames: [] }, { onWarn: (m) => warnings.push(m) })
    expect(warnings.some((w) => w.includes('declares no layouts'))).toBe(true)
  })

  it('stays silent for known layouts, and skips the lint on pre-layouts bundles', async () => {
    await writeFile(
      join(dir, '.mech/pages/docs-home.page.md'),
      serializePage({ content: [], data: {}, layout: 'docs' }),
    )
    const known: string[] = []
    await exportProject(dir, { ...ssr, layoutNames: ['site', 'docs'] }, { onWarn: (m) => known.push(m) })
    expect(known.some((w) => w.includes('layout'))).toBe(false)

    // No `layoutNames` on the bundle (built before layouts) → no lint at all.
    const legacy: string[] = []
    await exportProject(dir, ssr, { onWarn: (m) => legacy.push(m) })
    expect(legacy.some((w) => w.includes('layout'))).toBe(false)
  })

  it('warns when the site has no /404 page, and is satisfied by one', async () => {
    const without: string[] = []
    await exportProject(dir, ssr, { onWarn: (m) => without.push(m) })
    expect(without.filter((w) => w.includes('No /404 page'))).toHaveLength(1)

    await writeFile(
      join(dir, '.mech/pages/404.page.md'),
      serializePage({ content: [{ id: 'n', blockId: 'hero', data: { title: 'Lost?' } }], data: {} }),
    )
    const withPage: string[] = []
    await exportProject(dir, ssr, { onWarn: (m) => withPage.push(m) })
    expect(withPage.some((w) => w.includes('No /404 page'))).toBe(false)
  })
})

describe('mechanica/export (build-free entry)', () => {
  it('writes into outDir, emptying it without removing the directory itself', async () => {
    const outDir = join(dir, 'site-out')
    await mkdir(join(outDir, 'stale'), { recursive: true })
    await writeFile(join(outDir, 'stale/index.html'), 'old deploy')

    const written = await exportProject(dir, ssr, { outDir, onWarn: () => {} })

    expect(written.sort()).toEqual(['/', '/blog/post'])
    expect(await readFile(join(outDir, 'index.html'), 'utf-8')).toContain('<h1>Welcome</h1>')
    await expect(access(join(outDir, 'stale'))).rejects.toThrow()
    // The default location is left alone.
    await expect(access(join(dir, 'export'))).rejects.toThrow()
  })

  it('resolves useFetch through a supplied fetchJson instead of the network', async () => {
    const options = { url: 'https://api.example.com/prices', headers: { accept: 'application/json' } }
    const key = 'fetch.' + JSON.stringify(options)
    const fetching: SsrBundle = {
      ...ssr,
      render: async (state: any, context: any = {}) => {
        const result = (await context.resolveQuery(key)) as { price: number }
        return { html: `<main>${state.page?.path}: ${result.price}</main>`, query: { [key]: result } }
      },
    }
    const calls: unknown[] = []

    await exportProject(dir, fetching, {
      onWarn: () => {},
      fetchJson: async (received) => {
        calls.push(received)
        return { price: 42 }
      },
    })

    // The block's options arrive whole; one request serves every page that asks for it.
    expect(calls).toEqual([options])
    const html = await readFile(join(dir, 'export/index.html'), 'utf-8')
    expect(html).toContain('/: 42')
    // …and the result is baked into the page state for hydration.
    expect(html).toContain('"price":42')
  })

  it('exportBuilt loads dist/ssr.js itself and returns pages + collected warnings', async () => {
    await writeFile(
      join(dir, 'dist/ssr.js'),
      [
        `export const blocksList = [{ blockId: 'hero', __name: 'Hero', blockSchema: { name: 'Hero', props: { title: 'string' } } }]`,
        `export const dataEntries = []`,
        `export const render = (state) => '<main><h1>' + (state.content[0]?.data?.title ?? '') + '</h1></main>'`,
      ].join('\n'),
    )
    const forwarded: string[] = []

    const result = await exportBuilt(dir, { onWarn: (m) => forwarded.push(m) })

    expect(result.pages.sort()).toEqual(['/', '/blog/post'])
    expect(await readFile(join(dir, 'export/blog/post/index.html'), 'utf-8')).toContain('<h1>Post Body</h1>')
    // No /404 page in the fixture: reported in the result and still forwarded.
    expect(result.warnings.some((w) => w.includes('No /404 page'))).toBe(true)
    expect(forwarded).toEqual(result.warnings)
  })
})
