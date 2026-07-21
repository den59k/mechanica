import { describe, it, expect, vi, afterEach } from 'vitest'
import { shallowRef } from 'vue'
import type { ContentBlock } from 'mechanica-shared'
import { createRouter } from '@/core/router'

const makeRouter = (baseUrl?: string) =>
  createRouter(shallowRef<ContentBlock[]>([]), {}, { mode: 'client', baseUrl })

describe('createRouter', () => {
  it('normalizes paths against the base URL', () => {
    const router = makeRouter('/site')
    expect(router.normalizePath('/about')).toBe('/site/about')
    expect(router.normalizePath('/')).toBe('/site')
  })

  it('strips trailing slashes except for root', () => {
    const router = makeRouter()
    expect(router.normalizePath('/about/')).toBe('/about')
    expect(router.normalizePath('/')).toBe('/')
  })

  it('keeps the fragment while normalizing the path part', () => {
    const router = makeRouter('/site')
    expect(router.normalizePath('/about/#faq')).toBe('/site/about#faq')
    // A bare anchor stays a same-page anchor — the base URL is not prepended.
    expect(makeRouter().normalizePath('#faq')).toBe('#faq')
  })

  it('exposes a reactive current route', () => {
    const router = makeRouter()
    expect(router.currentRoute.path).toBeTypeOf('string')
  })
})

/** jsdom implements neither scroll API — stub both and report what was asked. */
const stubScroll = () => {
  const scrollTo = vi.fn()
  const scrollIntoView = vi.fn()
  vi.stubGlobal('scrollTo', scrollTo)
  Element.prototype.scrollIntoView = scrollIntoView
  return { scrollTo, scrollIntoView }
}

const stubPageFetch = (content: ContentBlock[] = []) => {
  const state = JSON.stringify({ content, data: {} })
  const html = `<html><head><title>Next</title></head><body><script>window.state=${state}</script></body></html>`
  const fetchMock = vi.fn(async () => ({ text: async () => html }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('ensureBlocks on navigation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('awaits missing block code before swapping in the new content', async () => {
    stubScroll()
    stubPageFetch([{ id: '1', blockId: 'hero', data: {} }])

    const content = shallowRef<ContentBlock[]>([])
    const seen: string[] = []
    const router = createRouter(content, {}, {
      mode: 'client',
      ensureBlocks: async (next) => {
        // Called with the incoming tree, before the visible content changes.
        seen.push(...next.map((block) => block.blockId))
        expect(content.value).toHaveLength(0)
      },
    })

    await router.push('/next')
    expect(seen).toEqual(['hero'])
    expect(content.value).toHaveLength(1)
  })
})

describe('scroll on navigation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
    // `push` moves the shared jsdom URL — without this the next router would
    // start on the previous test's page and treat its target as a same-page jump.
    window.history.replaceState({}, '', '/')
  })

  it('jumps to the top of a new page, without smooth scrolling', async () => {
    const { scrollTo } = stubScroll()
    stubPageFetch()

    await makeRouter().push('/next')

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
  })

  it('scrolls to the `#id` element instead of the top', async () => {
    const { scrollTo, scrollIntoView } = stubScroll()
    stubPageFetch()
    const anchor = document.createElement('div')
    anchor.id = 'faq'
    document.body.append(anchor)

    await makeRouter().push('/next#faq')

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' })
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('treats a bare `#id` as an in-page jump — no fetch, no content swap', async () => {
    const { scrollIntoView } = stubScroll()
    const fetchMock = stubPageFetch()
    const anchor = document.createElement('div')
    anchor.id = 'faq'
    document.body.append(anchor)

    const content = shallowRef<ContentBlock[]>([])
    await createRouter(content, {}, { mode: 'client' }).push('#faq')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(scrollIntoView).toHaveBeenCalledOnce()
  })

  it('leaves the view alone for a dead same-page anchor', async () => {
    const { scrollTo } = stubScroll()
    stubPageFetch()

    await makeRouter().push('#nope')

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('falls back to the top when a new page has no such anchor', async () => {
    const { scrollTo } = stubScroll()
    stubPageFetch()

    await makeRouter().push('/next#missing')

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
  })
})
