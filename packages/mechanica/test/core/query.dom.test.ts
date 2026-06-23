import { describe, it, expect } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import type { State } from '@mechanica/shared'
import { createMechanica } from '@/core/create-mechanica'
import { usePages } from '@/core/use-pages'
import { useFetch } from '@/core/use-fetch'

function withState(state: State) {
  const captured: { pages?: unknown; data?: unknown } = {}
  const Probe = defineComponent({
    setup() {
      captured.pages = usePages()
      captured.data = useFetch({ url: '/api/x' })
      return () => h('div')
    },
  })
  createApp(Probe).use(createMechanica({ mode: 'client', state })).mount(document.createElement('div'))
  return captured
}

describe('client query composables', () => {
  it('usePages reads serialized query data', () => {
    const key = 'getPages.' + JSON.stringify({})
    const { pages } = withState({
      content: [],
      data: {},
      query: { [key]: [{ path: '/' }, { path: '/about' }] },
    })
    expect(pages).toEqual([{ path: '/' }, { path: '/about' }])
  })

  it('useFetch reads serialized query data', () => {
    const key = 'fetch.' + JSON.stringify({ url: '/api/x' })
    const { data } = withState({ content: [], data: {}, query: { [key]: { ok: true } } })
    expect(data).toMatchObject({ ok: true })
  })
})
