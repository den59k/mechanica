import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import PageSelector from '@/editor/PageSelector.vue'

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

beforeEach(() => {
  vi.restoreAllMocks()
  // jsdom logs an error for real navigation; replace assign with a no-op.
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname: '/', assign: vi.fn() },
    writable: true,
    configurable: true,
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('PageSelector', () => {
  it('loads and lists pages', async () => {
    const pages = [
      { path: '/', name: 'Home' },
      { path: '/about', name: 'About' },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => pages })))

    const el = document.createElement('div')
    createApp({ render: () => h(PageSelector) }).mount(el)
    await flush()

    const options = [...el.querySelectorAll('option')].map((o) => o.textContent)
    expect(options.some((t) => t?.includes('About'))).toBe(true)
  })

  it('creates a new page via the dev API', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/@mechanica/pages') return { ok: true, json: async () => [] } as any
      return { ok: true, json: async () => ({ path: '/new' }) } as any
    })
    vi.stubGlobal('fetch', fetchMock)

    const el = document.createElement('div')
    createApp({ render: () => h(PageSelector) }).mount(el)
    await flush()

    el.querySelector<HTMLButtonElement>('.mech-pages__add')!.click()
    await nextTick()

    const [nameInput, pathInput] = el.querySelectorAll('.mech-pages__new input')
    ;(nameInput as HTMLInputElement).value = 'New'
    nameInput!.dispatchEvent(new Event('input'))
    ;(pathInput as HTMLInputElement).value = '/new'
    pathInput!.dispatchEvent(new Event('input'))

    el.querySelector<HTMLFormElement>('.mech-pages__new')!.dispatchEvent(new Event('submit'))
    await flush()

    expect(fetchMock).toHaveBeenCalledWith(
      '/@mechanica/pages',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'New', path: '/new' }) }),
    )
  })

  it('duplicates the current page via the dev API', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/@mechanica/pages') return { ok: true, json: async () => [{ path: '/', name: 'Home' }] } as any
      return { ok: true, json: async () => ({ path: '/home-copy' }) } as any
    })
    vi.stubGlobal('fetch', fetchMock)

    const el = document.createElement('div')
    createApp({ render: () => h(PageSelector) }).mount(el)
    await flush()

    const dupBtn = [...el.querySelectorAll('.mech-pages__action')].find((b) => b.textContent?.includes('Duplicate'))
    ;(dupBtn as HTMLButtonElement).click()
    await nextTick()

    const [nameInput, pathInput] = el.querySelectorAll('.mech-pages__new input')
    ;(pathInput as HTMLInputElement).value = '/home-copy'
    pathInput!.dispatchEvent(new Event('input'))

    el.querySelector<HTMLFormElement>('.mech-pages__new')!.dispatchEvent(new Event('submit'))
    await flush()

    expect((nameInput as HTMLInputElement).value).toContain('copy') // seeded default
    expect(fetchMock).toHaveBeenCalledWith(
      '/@mechanica/pages/duplicate?path=%2F',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('deletes the current page after confirmation', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [{ path: '/', name: 'Home' }] }) as any)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('confirm', vi.fn(() => true))

    const el = document.createElement('div')
    createApp({ render: () => h(PageSelector) }).mount(el)
    await flush()

    const delBtn = [...el.querySelectorAll('.mech-pages__action')].find((b) => b.textContent?.includes('Delete'))
    ;(delBtn as HTMLButtonElement).click()
    await flush()

    expect(fetchMock).toHaveBeenCalledWith('/@mechanica/pages?path=%2F', expect.objectContaining({ method: 'DELETE' }))
  })
})
