import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import PagesDialog from '@/editor/dialogs/PagesDialog.vue'
import PageBar from '@/editor/components/PageBar.vue'
import { createDialogStore, dialogKey, type DialogStore } from '@/editor/ui/dialog'

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

const pages = [
  { path: '/', name: 'Home', folderPath: null },
  { path: '/about', name: 'About', folderPath: null },
  { path: '/docs/intro', name: 'Intro', folderPath: 'docs' },
]

function mount(component: any, store: DialogStore = createDialogStore()) {
  const el = document.createElement('div')
  const app = createApp({ render: () => h(component) })
  app.provide(dialogKey, store)
  app.mount(el)
  return { el, app, store }
}

beforeEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname: '/', assign: vi.fn() },
    writable: true,
    configurable: true,
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('PagesDialog', () => {
  it('lists pages grouped by folder and filters by search', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => pages }) as any))
    const { el } = mount(PagesDialog)
    await flush()

    expect(el.textContent).toContain('Intro')
    expect([...el.querySelectorAll('.mech-pages-dialog__folder-name')].map((f) => f.textContent)).toContain('docs')

    const search = el.querySelector('.mech-pages-dialog__search') as HTMLInputElement
    search.value = 'about'
    search.dispatchEvent(new Event('input'))
    await nextTick()
    expect(el.textContent).toContain('About')
    expect(el.textContent).not.toContain('Intro')
  })

  it('creates a page via the dev API', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/@mechanica/pages') return { ok: true, json: async () => pages } as any
      return { ok: true, json: async () => ({ path: '/new' }) } as any
    })
    vi.stubGlobal('fetch', fetchMock)
    const { el } = mount(PagesDialog)
    await flush()

    const newBtn = [...el.querySelectorAll('.mech-button')].find((b) => b.textContent?.includes('New page'))!
    newBtn.dispatchEvent(new Event('click', { bubbles: true }))
    await nextTick()

    const [nameInput, pathInput] = el.querySelectorAll('.mech-pages-dialog__form input')
    ;(nameInput as HTMLInputElement).value = 'New'
    nameInput!.dispatchEvent(new Event('input'))
    ;(pathInput as HTMLInputElement).value = '/new'
    pathInput!.dispatchEvent(new Event('input'))
    el.querySelector('.mech-pages-dialog__form')!.dispatchEvent(new Event('submit'))
    await flush()

    expect(fetchMock).toHaveBeenCalledWith(
      '/@mechanica/pages',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'New', path: '/new' }) }),
    )
  })

  it('edits a page name and path via the form', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => pages }) as any)
    vi.stubGlobal('fetch', fetchMock)
    const { el } = mount(PagesDialog)
    await flush()

    const editBtn = el.querySelector('.mech-pages-dialog__actions button[title="Edit"]') as HTMLButtonElement
    editBtn.click()
    await nextTick()

    const [nameInput, pathInput] = el.querySelectorAll('.mech-pages-dialog__form input')
    ;(nameInput as HTMLInputElement).value = 'Homepage'
    nameInput!.dispatchEvent(new Event('input'))
    ;(pathInput as HTMLInputElement).value = '/start'
    pathInput!.dispatchEvent(new Event('input'))
    el.querySelector('.mech-pages-dialog__form')!.dispatchEvent(new Event('submit'))
    await flush()

    expect(fetchMock).toHaveBeenCalledWith(
      '/@mechanica/pages?path=%2F',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Homepage', path: '/start' }) }),
    )
  })

  it('deletes a page through a confirmation dialog', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => pages }) as any)
    vi.stubGlobal('fetch', fetchMock)
    const { el, store } = mount(PagesDialog)
    await flush()

    const delBtn = el.querySelector('.mech-pages-dialog__actions button[title="Delete"]') as HTMLButtonElement
    delBtn.click()
    await nextTick()

    // A confirm dialog is pushed; confirming runs the delete.
    expect(store.stack).toHaveLength(1)
    await (store.stack.at(-1)!.props as { onConfirm: () => void }).onConfirm()
    await flush()

    expect(fetchMock).toHaveBeenCalledWith('/@mechanica/pages?path=%2F', expect.objectContaining({ method: 'DELETE' }))
  })
})

describe('PageBar', () => {
  it('shows the current page name and opens the pages dialog', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => pages }) as any))
    const store = createDialogStore()
    const { el } = mount(PageBar, store)
    await flush()

    expect(el.querySelector('.mech-pagebar__name')?.textContent).toBe('Home')
    el.querySelector('.mech-pagebar')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(store.stack).toHaveLength(1)
  })
})
