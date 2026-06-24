import { describe, it, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountBlockPreview } from '@/editor/lib/block-preview'
import { useRouter } from '@/core/router'

describe('mountBlockPreview', () => {
  it('mounts a block into the target and tears it down on destroy', () => {
    const el = document.createElement('div')
    const Block = defineComponent({
      props: ['title'],
      render() {
        return h('h1', this.title)
      },
    })

    const handle = mountBlockPreview(el, Block, { title: 'Hi' })
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

    mountBlockPreview(el, Uses, {})
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

    mountBlockPreview(el, Bad, {}, () => {
      errored = true
    })
    expect(errored).toBe(true)
    expect(el.querySelector('*')).toBeNull()
  })
})
