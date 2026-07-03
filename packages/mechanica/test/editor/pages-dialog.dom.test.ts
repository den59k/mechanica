import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import PagesDialog from '@/editor/dialogs/PagesDialog.vue'
import PageFormDialog from '@/editor/dialogs/PageFormDialog.vue'
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

function mount(component: any, store: DialogStore = createDialogStore(), props?: Record<string, unknown>) {
  const el = document.createElement('div')
  const app = createApp({ render: () => h(component, props) })
  app.provide(dialogKey, store)
  app.mount(el)
  return { el, app, store }
}

const setInput = (input: Element, value: string) => {
  ;(input as HTMLInputElement).value = value
  input.dispatchEvent(new Event('input'))
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
  it('lists pages in a table grouped by folder and filters by search', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => pages }) as any))
    const { el } = mount(PagesDialog)
    await flush()

    expect(el.textContent).toContain('Intro')
    expect([...el.querySelectorAll('.mech-pages__group')].map((f) => f.textContent?.trim())).toContain('docs')

    const search = el.querySelector('.mech-pages__search') as HTMLInputElement
    setInput(search, 'about')
    await nextTick()
    expect(el.textContent).toContain('About')
    expect(el.textContent).not.toContain('Intro')
  })

  it('filters to one folder through the rail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => pages }) as any))
    const { el } = mount(PagesDialog)
    await flush()

    const railItems = [...el.querySelectorAll('.mech-pages__rail-item')]
    expect(railItems.map((item) => item.textContent?.trim())).toEqual(['All pages3', 'docs1'])

    railItems[1]!.dispatchEvent(new Event('click', { bubbles: true }))
    await nextTick()
    expect(el.querySelectorAll('.mech-pages__row')).toHaveLength(1)
    expect(el.textContent).toContain('Intro')
    expect([...el.querySelectorAll('.mech-pages__row')].map((r) => r.textContent)).not.toContain('About')
  })

  it('shows the highlighted page in the side preview', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => pages }) as any))
    const { el } = mount(PagesDialog)
    await flush()

    // The current page ("/") is highlighted initially.
    expect(el.querySelector('.mech-pages__preview-name')?.textContent).toBe('Home')

    const rows = el.querySelectorAll('.mech-pages__row')
    rows[1]!.dispatchEvent(new Event('mouseenter'))
    await flush()
    expect(el.querySelector('.mech-pages__preview-name')?.textContent).toBe('About')
    expect(el.querySelector('.mech-pages__preview-path')?.textContent).toBe('/about')
  })

  it('navigates with arrow keys and opens with Enter', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => pages }) as any))
    const { el } = mount(PagesDialog)
    await flush()

    const search = el.querySelector('.mech-pages__search') as HTMLInputElement
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await flush()
    expect(el.querySelector('.mech-pages__row.is-active .mech-pages__name')?.textContent).toBe('About')

    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flush()
    expect(window.location.assign).toHaveBeenCalledWith('/about')
  })

  it('creates a page through the form dialog', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/@mechanica/pages') return { ok: true, json: async () => pages } as any
      return { ok: true, json: async () => ({ path: '/new' }) } as any
    })
    vi.stubGlobal('fetch', fetchMock)
    const { el, store } = mount(PagesDialog)
    await flush()

    const newBtn = [...el.querySelectorAll('.mech-button')].find((b) => b.textContent?.includes('New page'))!
    newBtn.dispatchEvent(new Event('click', { bubbles: true }))
    await nextTick()

    // A PageFormDialog is pushed; submitting it hits the create endpoint.
    expect(store.stack).toHaveLength(1)
    expect(store.stack[0]!.component).toBe(PageFormDialog)
    const props = store.stack[0]!.props as { mode: string; onSubmit: (i: any) => Promise<string | null> }
    expect(props.mode).toBe('create')

    const error = await props.onSubmit({ name: 'New', path: '/new' })
    expect(error).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(
      '/@mechanica/pages',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'New', path: '/new' }) }),
    )
  })

  it('renames a page through the form dialog', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => pages }) as any)
    vi.stubGlobal('fetch', fetchMock)
    const { el, store } = mount(PagesDialog)
    await flush()

    const editBtn = el.querySelector('.mech-pages__actions button[title="Rename"]') as HTMLButtonElement
    editBtn.click()
    await nextTick()

    const props = store.stack[0]!.props as {
      mode: string
      initialName: string
      initialPath: string
      onSubmit: (i: any) => Promise<string | null>
    }
    expect(props.mode).toBe('edit')
    expect(props.initialName).toBe('Home')
    expect(props.initialPath).toBe('/')

    await props.onSubmit({ name: 'Homepage', path: '/start' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/@mechanica/pages?path=%2F',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Homepage', path: '/start' }) }),
    )
  })

  it('surfaces server errors from the form submit', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/@mechanica/pages' && init?.method !== 'POST') return { ok: true, json: async () => pages } as any
      return { ok: false, json: async () => ({ error: { path: 'Page already exists' } }) } as any
    })
    vi.stubGlobal('fetch', fetchMock)
    const { el, store } = mount(PagesDialog)
    await flush()

    const newBtn = [...el.querySelectorAll('.mech-button')].find((b) => b.textContent?.includes('New page'))!
    newBtn.dispatchEvent(new Event('click', { bubbles: true }))
    await nextTick()

    const props = store.stack[0]!.props as { onSubmit: (i: any) => Promise<string | null> }
    expect(await props.onSubmit({ name: 'Dup', path: '/about' })).toBe('Page already exists')
  })

  it('deletes a page through a confirmation dialog', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => pages }) as any)
    vi.stubGlobal('fetch', fetchMock)
    const { el, store } = mount(PagesDialog)
    await flush()

    const delBtn = el.querySelector('.mech-pages__actions button[title="Delete"]') as HTMLButtonElement
    delBtn.click()
    await nextTick()

    // A confirm dialog is pushed; confirming runs the delete.
    expect(store.stack).toHaveLength(1)
    await (store.stack.at(-1)!.props as { onConfirm: () => void }).onConfirm()
    await flush()

    expect(fetchMock).toHaveBeenCalledWith('/@mechanica/pages?path=%2F', expect.objectContaining({ method: 'DELETE' }))
  })
})

describe('PageFormDialog', () => {
  it('derives the path from the name until the path is edited by hand', async () => {
    const onSubmit = vi.fn(async () => null)
    const { el } = mount(PageFormDialog, createDialogStore(), { mode: 'create', folder: 'docs', onSubmit })
    await flush()

    const [nameInput, pathInput] = el.querySelectorAll('.mech-input')
    setInput(nameInput!, 'Getting Started')
    await nextTick()
    expect((pathInput as HTMLInputElement).value).toBe('/docs/getting-started')

    // A hand-edited path stops following the name.
    setInput(pathInput!, '/docs/start')
    setInput(nameInput!, 'Other Name')
    await nextTick()
    expect((pathInput as HTMLInputElement).value).toBe('/docs/start')

    el.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flush()
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Other Name', path: '/docs/start' })
  })

  it('shows the error returned by onSubmit and stays open', async () => {
    const store = createDialogStore()
    const onSubmit = vi.fn(async () => 'Page already exists')
    const { el } = mount(PageFormDialog, store, { mode: 'create', onSubmit })
    await flush()

    const [nameInput] = el.querySelectorAll('.mech-input')
    setInput(nameInput!, 'About')
    el.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flush()

    expect(el.querySelector('.mech-page-form__error')?.textContent).toBe('Page already exists')
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
