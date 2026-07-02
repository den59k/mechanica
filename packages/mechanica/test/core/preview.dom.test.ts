import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { buildPreviewContent, mountPreviewApp } from '@/core/preview'
import type { BlocksMap } from '@/core/state'

const Hero = defineComponent({
  props: ['title', 'count'],
  blockId: 'hero',
  blockSchema: {
    id: 'hero',
    props: { title: 'string', count: 'number' },
    previewData: { title: 'From previewData' },
  },
  render() {
    return h('div', { class: 'hero' }, `${this.title}:${this.count}`)
  },
})

const Broken = defineComponent({
  blockId: 'broken',
  blockSchema: { id: 'broken' },
  setup() {
    throw new Error('boom')
  },
})

const Section = defineComponent({
  blockId: 'section',
  blockSchema: { id: 'section', slots: { default: true } },
  render() {
    return h('section', { class: 'section' }, this.$slots.default?.())
  },
})

const Split = defineComponent({
  blockId: 'split',
  blockSchema: {
    id: 'split',
    slots: { start: true, end: true },
    previewData: { $slots: { start: [{ blockId: 'hero', data: { title: 'In start' } }] } },
  },
  render() {
    return h('div', { class: 'split' }, [
      h('div', { class: 'start' }, this.$slots.start?.()),
      h('div', { class: 'end' }, this.$slots.end?.()),
    ])
  },
})

// A block whose previewData nests itself — must not recurse forever.
const Loop = defineComponent({
  blockId: 'loop',
  blockSchema: {
    id: 'loop',
    slots: { default: true },
    previewData: { $slots: { default: [{ blockId: 'loop' }] } },
  },
  render() {
    return h('div', { class: 'loop' }, this.$slots.default?.())
  },
})

const blocks: BlocksMap = new Map([
  ['hero', Hero as never],
  ['broken', Broken as never],
  ['section', Section as never],
  ['split', Split as never],
  ['loop', Loop as never],
])

let target: HTMLElement
const w = window as unknown as Record<string, unknown>

beforeEach(() => {
  target = document.createElement('div')
  document.body.appendChild(target)
  delete w.__MECHANICA_PREVIEW__
  delete w.__MECHANICA_PREVIEW_READY__
  delete w.__MECHANICA_PREVIEW_ERROR__
})

afterEach(() => {
  target.remove()
})

describe('mountPreviewApp', () => {
  it('renders the block with previewData merged over schema defaults', async () => {
    const result = await mountPreviewApp({ blocks, target, request: { blockId: 'hero' } })
    expect(result.error).toBeUndefined()
    expect(target.querySelector('.hero')!.textContent).toBe('From previewData:0')
    expect(w.__MECHANICA_PREVIEW_READY__).toBe(true)
    expect(w.__MECHANICA_PREVIEW_ERROR__).toBeUndefined()
    result.app!.unmount()
  })

  it('applies request data over previewData', async () => {
    const result = await mountPreviewApp({
      blocks,
      target,
      request: { blockId: 'hero', data: { title: 'Override', count: 7 } },
    })
    expect(target.querySelector('.hero')!.textContent).toBe('Override:7')
    result.app!.unmount()
  })

  it('reads the request from window.__MECHANICA_PREVIEW__ by default', async () => {
    w.__MECHANICA_PREVIEW__ = { blockId: 'hero', data: { title: 'Global' } }
    const result = await mountPreviewApp({ blocks, target })
    expect(target.querySelector('.hero')!.textContent).toBe('Global:0')
    result.app!.unmount()
  })

  it('reports an unknown block without throwing', async () => {
    const result = await mountPreviewApp({ blocks, target, request: { blockId: 'nope' } })
    expect(result.app).toBeNull()
    expect(result.error).toContain('Unknown block "nope"')
    expect(result.error).toContain('hero')
    expect(w.__MECHANICA_PREVIEW_ERROR__).toContain('Unknown block')
    expect(w.__MECHANICA_PREVIEW_READY__).toBe(true)
    expect(target.textContent).toContain('Unknown block "nope"')
  })

  it('reports a missing block id', async () => {
    const result = await mountPreviewApp({ blocks, target, request: {} })
    expect(result.error).toContain('No block id')
    expect(w.__MECHANICA_PREVIEW_READY__).toBe(true)
  })

  it('captures render errors but still becomes ready', async () => {
    const result = await mountPreviewApp({ blocks, target, request: { blockId: 'broken' } })
    expect(result.error).toContain('boom')
    expect(w.__MECHANICA_PREVIEW_ERROR__).toContain('boom')
    expect(w.__MECHANICA_PREVIEW_READY__).toBe(true)
    result.app?.unmount()
  })

  it('fills an unauthored slot with a labelled placeholder', async () => {
    const result = await mountPreviewApp({ blocks, target, request: { blockId: 'section' } })
    expect(result.error).toBeUndefined()
    expect(target.querySelector('.section')!.textContent).toContain('slot: default')
    result.app!.unmount()
  })

  it('renders $slots children with their own preview data, placeholders elsewhere', async () => {
    const result = await mountPreviewApp({ blocks, target, request: { blockId: 'split' } })
    // `start` is authored: a hero whose overrides win, but previewData fills the rest.
    expect(target.querySelector('.start .hero')!.textContent).toBe('In start:0')
    // `end` is not authored → placeholder.
    expect(target.querySelector('.end')!.textContent).toContain('slot: end')
    result.app!.unmount()
  })

  it('caps self-referencing $slots instead of recursing forever', async () => {
    const result = await mountPreviewApp({ blocks, target, request: { blockId: 'loop' } })
    expect(result.error).toBeUndefined()
    expect(target.querySelectorAll('.loop').length).toBeGreaterThan(1)
    expect(target.querySelectorAll('.loop').length).toBeLessThanOrEqual(5)
    result.app!.unmount()
  })
})

describe('buildPreviewContent', () => {
  it('returns null for an unknown block', () => {
    expect(buildPreviewContent(blocks, 'nope')).toBeNull()
  })

  it('nests default-slot children as an array and named slots as a record', () => {
    const section = buildPreviewContent(blocks, 'section')!
    expect(Array.isArray(section.content.children)).toBe(true)

    const split = buildPreviewContent(blocks, 'split')!
    expect(Array.isArray(split.content.children)).toBe(false)
    const children = split.content.children as Record<string, unknown[]>
    expect(Object.keys(children)).toEqual(['start', 'end'])
  })

  it('strips $slots from the rendered prop data', () => {
    const split = buildPreviewContent(blocks, 'split')!
    expect('$slots' in split.content.data).toBe(false)
  })
})
