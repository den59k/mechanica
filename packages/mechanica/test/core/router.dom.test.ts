import { describe, it, expect, vi, afterEach } from 'vitest'
import { shallowRef } from 'vue'
import type { ContentBlock } from '@mechanica/shared'
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

  it('exposes a reactive current route', () => {
    const router = makeRouter()
    expect(router.currentRoute.path).toBeTypeOf('string')
  })
})

describe('ensureBlocks on navigation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('awaits missing block code before swapping in the new content', async () => {
    const nextContent = [{ id: '1', blockId: 'hero', data: {} }]
    const state = JSON.stringify({ content: nextContent, data: {} })
    const html = `<html><head><title>Next</title></head><body><script>window.state=${state}</script></body></html>`
    vi.stubGlobal('fetch', vi.fn(async () => ({ text: async () => html })))

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
