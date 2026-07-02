import { describe, it, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountBlockPreview } from '@/editor/lib/block-preview'
import { useRouter } from '@/core/router'
import type { BlocksMap } from '@/core/state'

const asBlocks = (entries: Record<string, unknown>): BlocksMap =>
  new Map(Object.entries(entries)) as BlocksMap

describe('mountBlockPreview', () => {
  it('mounts a block into the target and tears it down on destroy', () => {
    const el = document.createElement('div')
    const Block = defineComponent({
      props: ['title'],
      blockSchema: { id: 'titled', props: { title: 'string' }, previewData: { title: 'Hi' } },
      render() {
        return h('h1', this.title)
      },
    })

    const handle = mountBlockPreview(el, { blocks: asBlocks({ titled: Block }), blockId: 'titled' })
    expect(el.querySelector('h1')?.textContent).toBe('Hi')

    handle.destroy()
    expect(el.querySelector('h1')).toBeNull()
  })

  it('provides an inert runtime so blocks that inject it still render', () => {
    const el = document.createElement('div')
    // Without a provided context this would throw "used outside a Mechanica app".
    const Uses = defineComponent({
      setup() {
        const router = useRouter()
        return () => h('a', router.currentRoute.path)
      },
    })

    mountBlockPreview(el, { blocks: asBlocks({ uses: Uses }), blockId: 'uses' })
    expect(el.querySelector('a')?.textContent).toBe('/')
  })

  it('reports via onError and renders nothing when the block throws', () => {
    const el = document.createElement('div')
    let errored = false
    const Bad = defineComponent({
      setup() {
        throw new Error('boom')
      },
    })

    mountBlockPreview(el, { blocks: asBlocks({ bad: Bad }), blockId: 'bad' }, () => {
      errored = true
    })
    expect(errored).toBe(true)
    expect(el.querySelector('*')).toBeNull()
  })

  it('reports via onError for an unknown block id', () => {
    const el = document.createElement('div')
    let errored = false
    mountBlockPreview(el, { blocks: asBlocks({}), blockId: 'missing' }, () => {
      errored = true
    })
    expect(errored).toBe(true)
  })

  it('previews slots with placeholders', () => {
    const el = document.createElement('div')
    const Container = defineComponent({
      blockSchema: { id: 'container', slots: { default: true } },
      render() {
        return h('section', this.$slots.default?.())
      },
    })

    mountBlockPreview(el, { blocks: asBlocks({ container: Container }), blockId: 'container' })
    expect(el.textContent).toContain('slot: default')
  })
})
