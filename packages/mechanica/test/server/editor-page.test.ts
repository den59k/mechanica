import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { EDITOR_DIST_DIR, type SiteManifest, type State } from 'mechanica-shared'
import { createEditorService, readEditorTemplate, renderEditablePage } from '@/server'

const dirs: string[] = []
function temp(prefix: string): string {
  const dir = fs.mkdtempSync(join(os.tmpdir(), prefix))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const template = [
  '<html><head><title>{{ head.title }} — {{ site.name }}</title></head>',
  '<body><div id="app"></div><script type="module" src="/assets/index.js"></script></body></html>',
].join('\n')

describe('renderEditablePage', () => {
  const state: State = {
    content: [{ id: 'a', blockId: 'hero', data: { title: '</script><b>' } }],
    data: { head: { title: 'About <us>' } },
    page: { path: '/about', meta: {} },
  }

  it('templates the head and injects the state ahead of the module script', () => {
    const html = renderEditablePage(template, state, { site: { name: 'Acme' } })
    expect(html).toContain('<title>About &lt;us&gt; — Acme</title>')
    expect(html.indexOf('window.state=')).toBeGreaterThan(html.indexOf('<body>'))
    expect(html.indexOf('window.state=')).toBeLessThan(html.indexOf('/assets/index.js'))
    // The state can't close its own script tag.
    expect(html.match(/<\/script>/g)).toHaveLength(2)
    expect(html).not.toContain('__MECHANICA_EDITOR__')
  })

  it('carries the host config and any extra scripts', () => {
    const html = renderEditablePage(template, state, {
      hostConfig: { capabilities: { composer: false } },
      scripts: '<script type="module">import "x"</script>',
    })
    expect(html).toContain('window.__MECHANICA_EDITOR__={"capabilities":{"composer":false}}')
    expect(html.indexOf('__MECHANICA_EDITOR__')).toBeLessThan(html.indexOf('window.state='))
    expect(html).toContain('import "x"')
  })
})

describe('readEditorTemplate', () => {
  it('reads the editor build left in dist, or null', () => {
    const dist = temp('mech-dist-')
    expect(readEditorTemplate(dist)).toBeNull()
    fs.mkdirSync(join(dist, EDITOR_DIST_DIR))
    fs.writeFileSync(join(dist, EDITOR_DIST_DIR, 'index.html'), template)
    expect(readEditorTemplate(dist)).toBe(template)
  })
})

describe('service.page', () => {
  const manifest: SiteManifest = {
    format: 1,
    blocks: [],
    site: { name: 'Acme' },
    locales: null,
    generated: [{ path: '/shop/item', name: 'Item', content: [], data: { head: { title: 'Item' } } } as never],
  }

  it('renders the editable page for a URL, authored or generated', async () => {
    const mechDir = temp('mech-')
    fs.mkdirSync(join(mechDir, 'pages'))
    const service = createEditorService(mechDir, {
      site: manifest,
      editorHtml: template,
      hostConfig: { capabilities: { composer: false } },
    })
    await service.handle(
      new Request('http://host/pages', { method: 'POST', body: JSON.stringify({ path: '/about', name: 'About' }) }),
    )
    await service.handle(
      new Request('http://host/save?path=/about', {
        method: 'POST',
        body: JSON.stringify({ content: [], pageData: { head: { title: 'About' } } }),
      }),
    )

    const page = await service.page('/about')
    expect(page!.headers.get('content-type')).toContain('text/html')
    const html = await page!.text()
    expect(html).toContain('<title>About — Acme</title>')
    expect(html).toContain('"path":"/about"')
    expect(html).toContain('__MECHANICA_EDITOR__')

    expect(await (await service.page('/shop/item'))!.text()).toContain('<title>Item — Acme</title>')
  })

  it('is null without an editor template', async () => {
    expect(await createEditorService(temp('mech-')).page('/')).toBeNull()
  })
})
