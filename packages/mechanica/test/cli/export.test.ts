import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { serializePage } from '@mechanica/shared'
import { exportProject, type SsrBundle } from '@/cli/export'

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
  blocksList: [{ blockId: 'hero', __name: 'Hero', blockSchema: { name: 'Hero', props: { title: 'string' } } }],
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
})
