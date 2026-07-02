import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountPreviewApp } from '@/core/preview'
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

const blocks: BlocksMap = new Map([
  ['hero', Hero as never],
  ['broken', Broken as never],
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
})
