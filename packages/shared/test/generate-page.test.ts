import { describe, it, expect } from 'vitest'
import { registerFieldSchemas } from '@/fields'
import { generatePage, generateProject, passDataToHTML, serializeState } from '@/generate-page'
import { getValueByPath } from '@/schema'
import type { Block } from '@/types'

describe('serializeState', () => {
  it('escapes inline-script-breaking characters and round-trips as JSON', () => {
    const LS = String.fromCharCode(0x2028)
    const PS = String.fromCharCode(0x2029)
    const state = {
      content: [{ id: '1', blockId: 'code', data: { code: 'a</script><script>b</script>c\n<!-- d -->' } }],
      sep: `x${LS}y${PS}z`,
    }
    const out = serializeState(state)
    expect(out).not.toContain('</script>') // can't close the inline <script>
    expect(out).not.toContain('<script>')
    expect(out).not.toContain('<!--')
    expect(out).not.toContain(LS) // U+2028/U+2029 are invalid in JS string literals
    expect(out).not.toContain(PS)
    // Still valid JSON/JS that decodes back to the original.
    expect(JSON.parse(out)).toEqual(state)
  })
})

registerFieldSchemas(() => {})

const blocksMap = new Map<string, Block>([
  ['hero', { id: 'hero', name: 'Hero', props: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } }],
  ['pic', { id: 'pic', name: 'Pic', props: { type: 'object', properties: { img: { type: 'object', format: 'image', properties: { src: { type: 'string' } } } }, required: ['img'] } }],
])

const index = '<html><head><title>{{page.title}}</title></head><body><div id="app"></div></body></html>'

describe('passDataToHTML', () => {
  it('substitutes dotted placeholders', () => {
    expect(passDataToHTML('Hi {{ user.name }}', { user: { name: 'Ann' } })).toBe('Hi Ann')
    expect(passDataToHTML('{{ missing.x }}', {})).toBe('')
    expect(getValueByPath({ a: { b: 1 } }, 'a.b')).toBe(1)
  })

  it('html-escapes resolved values (safe for <title>/<meta content>)', () => {
    const html = '<meta content="{{ seo.description }}" />'
    const out = passDataToHTML(html, { seo: { description: 'A & B <i> "q"' } })
    expect(out).toBe('<meta content="A &amp; B &lt;i&gt; &quot;q&quot;" />')
  })

  it('triple braces emit raw, script-safe JSON (for JSON-LD)', () => {
    const html = '<script type="application/ld+json">{{{ head.schema }}}</script>'
    const out = passDataToHTML(html, { head: { schema: { '@type': 'Article', name: 'x</script>' } } })
    // Real JSON (quotes not HTML-escaped), with `<` escaped so it can't close the script.
    expect(out).toContain('"@type":"Article"')
    expect(out).toContain('"name":"x\\u003c/script>"')
    expect(out).not.toContain('&quot;')
    // A missing value leaves the script body empty rather than emitting "undefined".
    expect(passDataToHTML('<script>{{{ missing.x }}}</script>', {})).toBe('<script></script>')
  })
})

describe('generatePage', () => {
  it('renders content into #app and serializes state', async () => {
    const { html } = await generatePage({
      index,
      blocksMap,
      dataEntries: [],
      state: { content: [{ id: '1', blockId: 'hero', data: { title: 'Hello' } }], data: {} },
      render: (state) => `<h1>${state.content[0].data.title}</h1>`,
      path: '/',
    })
    expect(html).toContain('<div id="app"><h1>Hello</h1></div>')
    expect(html).toContain('window.state=')
    // The page's own path rides the hydration state.
    expect(html).toContain('"page":{"path":"/"}')
  })

  it('templates {{ page.path }} and {{ site.* }} like dev does', async () => {
    const { html } = await generatePage({
      index:
        '<html><head><link rel="canonical" href="{{ site.url }}{{ page.path }}/"><title>{{ site.name }}</title></head>' +
        '<body><div id="app"></div></body></html>',
      blocksMap,
      dataEntries: [],
      site: { url: 'https://acme.test', name: 'Acme' },
      state: { content: [], data: {} },
      render: () => '',
      path: '/about',
    })
    expect(html).toContain('<link rel="canonical" href="https://acme.test/about/">')
    expect(html).toContain('<title>Acme</title>')
  })

  it('bakes render-collected query results into the hydration state', async () => {
    const { html, query } = await generatePage({
      index,
      blocksMap,
      dataEntries: [],
      state: { content: [], data: {} },
      render: () => ({
        html: '<nav></nav>',
        query: { 'getPages.{}': [{ path: '/', name: 'Home' }] },
      }),
      path: '/',
    })
    expect(query).toEqual({ 'getPages.{}': [{ path: '/', name: 'Home' }] })
    expect(html).toContain('"query":{"getPages.{}":[{"path":"/","name":"Home"}]}')
  })

  it('serializes no query key when the render resolved nothing', async () => {
    const { html } = await generatePage({
      index,
      blocksMap,
      dataEntries: [],
      state: { content: [], data: {} },
      render: () => ({ html: '', query: {} }),
    })
    expect(html).not.toContain('"query"')
  })

  it('injects pageLinks for the page content before </head>', async () => {
    const content = [{ id: '1', blockId: 'hero', data: { title: 'Hi' } }]
    const { html } = await generatePage({
      index,
      blocksMap,
      dataEntries: [],
      state: { content, data: {} },
      render: () => '',
      pageLinks: (c) => {
        expect(c).toBe(content)
        return ['<link rel="modulepreload" href="/assets/hero.js">']
      },
    })
    expect(html).toContain('<link rel="modulepreload" href="/assets/hero.js">\n</head>')
  })

  it('leaves the html untouched when pageLinks returns nothing', async () => {
    const { html } = await generatePage({
      index,
      blocksMap,
      dataEntries: [],
      state: { content: [], data: {} },
      render: () => '',
      pageLinks: () => [],
    })
    expect(html).not.toContain('<link')
  })

  it('rewrites asset URLs when assetsUrl is set', async () => {
    const { html } = await generatePage({
      index: '<body><div id="app"></div><img src="/assets/x.png"></body>',
      blocksMap,
      dataEntries: [],
      state: { content: [], data: {} },
      render: () => '',
      assetsUrl: '/cdn/',
    })
    expect(html).toContain('/cdn/x.png')
    expect(html).not.toContain('/assets/x.png')
  })
})

describe('generateProject', () => {
  it('yields one result per page and rewrites asset files', async () => {
    const pages = [
      {
        path: '/',
        content: [
          {
            id: '1',
            blockId: 'pic',
            // A cropped image: src (original), previewSrc (LQIP) and croppedSrc
            // (the baked derivative) all get rewritten to the export URL space.
            data: {
              img: {
                src: '/uploads/a.png',
                previewSrc: '/uploads/a.png',
                croppedSrc: '/uploads/a.crop-abc.webp',
              },
            },
          },
        ],
        data: {},
      },
      { path: '/about', content: [], data: {} },
    ]
    const seen: string[] = []
    const results: string[] = []
    for await (const { path } of generateProject({
      index,
      blocksMap,
      dataEntries: [],
      pages,
      render: () => '',
      onFile: (src) => {
        seen.push(src)
        return src.replace('/uploads/', '/static/')
      },
    })) {
      results.push(path)
    }
    expect(results).toEqual(['/', '/about'])
    expect(seen).toContain('/uploads/a.png')
    expect(seen).toContain('/uploads/a.crop-abc.webp')
    expect(pages[0]!.content[0]!.data.img.src).toBe('/static/a.png')
    expect(pages[0]!.content[0]!.data.img.croppedSrc).toBe('/static/a.crop-abc.webp')
  })
})
