import { describe, it, expect } from 'vitest'
import { registerFieldSchemas } from './fields'
import { generatePage, generateProject, passDataToHTML, getValueByPath } from './generate-page'
import type { Block } from './types'

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
})

describe('generatePage', () => {
  it('renders content into #app and serializes state', async () => {
    const html = await generatePage({
      index,
      blocksMap,
      dataEntries: [],
      state: { content: [{ id: '1', blockId: 'hero', data: { title: 'Hello' } }], data: {} },
      render: (state) => `<h1>${state.content[0].data.title}</h1>`,
      path: '/',
    })
    expect(html).toContain('<div id="app"><h1>Hello</h1></div>')
    expect(html).toContain('window.state=')
  })

  it('rewrites asset URLs when assetsUrl is set', async () => {
    const html = await generatePage({
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
  it('yields one html per page and rewrites asset files', async () => {
    const pages = [
      { path: '/', content: [{ id: '1', blockId: 'pic', data: { img: { src: '/uploads/a.png' } } }], data: {} },
      { path: '/about', content: [], data: {} },
    ]
    const seen: string[] = []
    const results: string[] = []
    for await (const [, p] of generateProject({
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
      results.push(p)
    }
    expect(results).toEqual(['/', '/about'])
    expect(seen).toContain('/uploads/a.png')
    expect(pages[0]!.content[0]!.data.img.src).toBe('/static/a.png')
  })
})
