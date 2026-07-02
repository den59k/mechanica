import { describe, it, expect } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import type { State } from '@mechanica/shared'
import { createMechanica } from '@/core/create-mechanica'
import { usePagination, type PaginationResult } from '@/core/use-pagination'

const FILTER = { folderName: 'blog', pageSize: 2 }
const KEY = 'getPages.' + JSON.stringify(FILTER)

function mountWith(state: State) {
  let pager!: PaginationResult<[]>
  const Probe = defineComponent({
    setup() {
      pager = usePagination(FILTER)
      return () => h('div')
    },
  })
  createApp(Probe).use(createMechanica({ mode: 'client', state })).mount(document.createElement('div'))
  return pager
}

describe('usePagination', () => {
  it('hydrates the baked slice and exposes pager paths', () => {
    const pager = mountWith({
      content: [],
      data: {},
      page: { path: '/blog' },
      query: { [KEY]: { items: [{ path: '/blog/a', name: 'A' }], page: 1, pageCount: 3, pageSize: 2, total: 5 } },
    })
    expect(pager.items).toEqual([{ path: '/blog/a', name: 'A' }])
    expect(pager.page).toBe(1)
    expect(pager.pageCount).toBe(3)
    expect(pager.prevPath).toBeNull()
    expect(pager.nextPath).toBe('/blog/2')
    expect(pager.pathFor(1)).toBe('/blog')
    expect(pager.pathFor(3)).toBe('/blog/3')
  })

  it('derives the base path on a variant URL', () => {
    const pager = mountWith({
      content: [],
      data: {},
      page: { path: '/blog/2', pagination: { page: 2 } },
      query: { [KEY]: { items: [{ path: '/blog/c', name: 'C' }], page: 2, pageCount: 3, pageSize: 2, total: 5 } },
    })
    expect(pager.page).toBe(2)
    expect(pager.prevPath).toBe('/blog')
    expect(pager.nextPath).toBe('/blog/3')
  })

  it('handles a paginated root page', () => {
    const pager = mountWith({
      content: [],
      data: {},
      page: { path: '/' },
      query: { [KEY]: { items: [], page: 1, pageCount: 2, pageSize: 2, total: 3 } },
    })
    expect(pager.nextPath).toBe('/2')
    expect(pager.pathFor(1)).toBe('/')
  })

  it('keeps its initial shape when nothing is baked', () => {
    const pager = mountWith({ content: [], data: {}, page: { path: '/blog' } })
    expect(pager.items).toEqual([])
    expect(pager.pageCount).toBe(1)
    expect(pager.prevPath).toBeNull()
    expect(pager.nextPath).toBeNull()
  })
})
