import { describe, it, expect } from 'vitest'
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
