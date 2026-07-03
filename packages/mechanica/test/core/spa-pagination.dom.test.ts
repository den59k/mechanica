import { describe, it, expect, vi, afterEach } from 'vitest'
import { createApp, defineComponent, h, inject, nextTick } from 'vue'
import type { State } from 'mechanica-shared'
import { createMechanica } from '@/core/create-mechanica'
import { Content } from '@/core/content'
import { mechanicaKey, type MechanicaContext } from '@/core/state'
import { runQuery } from '@/core/query'

const KEY = 'getPages.{"folderName":"blog","pageSize":2}'

/** A page's serialized HTML the router will fetch for SPA navigation. */
function pageHtml(state: State): string {
  return `<html><head><title>t</title></head><body><script>window.state = ${JSON.stringify(state)}</script></body></html>`
}

const baseContent = [{ id: 'list1', blockId: 'blog-list', data: {} }]

function variantState(page: number): State {
  return {
    content: baseContent,
    data: {},
    query: { [KEY]: { items: [`post-${page}`], page } },
    page: { path: '/blog', pagination: { page, pageCount: 3 } },
  }
}

// A query-driven block: mount-time query read + a setup counter, so the tests
// can tell whether navigation remounted it and which slice it read.
let setups = 0
const BlogList = defineComponent({
  props: {},
  setup() {
    setups++
    const result = runQuery(KEY, { items: [] as string[], page: 1 })
    return () => h('div', { class: 'list' }, `${result.items.join(',')}|p${result.page}`)
  },
})

function mount() {
  setups = 0
  const el = document.createElement('div')
  document.body.appendChild(el)
  let ctx!: MechanicaContext
  const Root = defineComponent({
    setup() {
      ctx = inject(mechanicaKey)!
      return () => h(Content)
    },
  })
  const app = createApp(Root)
  app.use(
    createMechanica({
      mode: 'client',
      state: variantState(1),
      blocks: new Map([['blog-list', BlogList]]),
    }),
  )
  app.mount(el)
  return { el, ctx, app }
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('SPA navigation across paginated variants', () => {
  it('applies the target page state and remounts blocks for the new slice', async () => {
    const { el, ctx } = mount()
    expect(el.textContent).toBe('post-1|p1')
    expect(setups).toBe(1)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ text: async () => pageHtml(variantState(2)) })),
    )
    await ctx.router.push('/blog/2')
    await nextTick()

    // Same content tree, but the block remounted and read page 2's baked slice.
    expect(ctx.page.pagination?.page).toBe(2)
    expect(el.textContent).toBe('post-2|p2')
    expect(setups).toBe(2)
    expect(ctx.router.currentRoute.path).toBe('/blog/2')
  })

  it('replaces baked query results instead of merging them', async () => {
    const { ctx } = mount()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        text: async () => pageHtml({ content: [], data: {}, page: { path: '/about' } }),
      })),
    )
    await ctx.router.push('/about')
    expect(ctx.queryData[KEY]).toBeUndefined()
    expect(ctx.page.path).toBe('/about')
    expect(ctx.page.pagination).toBeUndefined()
  })
})
