import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, nextTick, ref, type App } from 'vue'
import QuickSwitcher from '@/editor/dialogs/QuickSwitcher.vue'
import { createDialogStore, dialogKey } from '@/editor/ui/dialog'
import { navigationKey, type PageNavigation } from '@/editor/lib/navigation'

const pages = [
  { path: '/', name: 'Home', folderPath: null },
  { path: '/about', name: 'About us', folderPath: null },
  { path: '/blog/post', name: 'First post', folderPath: 'blog' },
]

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => pages })),
  )
})

function mount() {
  const dialog = createDialogStore()
  dialog.open(QuickSwitcher)
  const switchPage = vi.fn(async () => true)
  const navigation: PageNavigation = { path: ref('/'), switchPage }

  const el = document.createElement('div')
  document.body.appendChild(el)
  const app: App = createApp(QuickSwitcher)
  app.provide(dialogKey, dialog)
  app.provide(navigationKey, navigation)
  app.mount(el)
  return { el, app, dialog, switchPage }
}

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve))
  await nextTick()
}

describe('QuickSwitcher', () => {
  it('lists pages only and filters by query', async () => {
    const { el, app } = mount()
    await flush()

    expect(el.textContent).toContain('Home')
    expect(el.textContent).toContain('First post')

    const input = el.querySelector('input')!
    input.value = 'about'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(el.textContent).toContain('About us')
    expect(el.textContent).not.toContain('Home')
    app.unmount()
  })

  it('switches to a page with Enter and records it as recent', async () => {
    const { el, app, switchPage, dialog } = mount()
    await flush()

    const input = el.querySelector('input')!
    input.value = 'about'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flush()

    expect(switchPage).toHaveBeenCalledWith('/about')
    expect(JSON.parse(localStorage.getItem('mechanica:recent-pages')!)).toEqual(['/about'])
    expect(dialog.stack).toHaveLength(0)
    app.unmount()
  })

  it('navigates the list with arrow keys', async () => {
    const { el, app, switchPage } = mount()
    await flush()

    const input = el.querySelector('input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await nextTick()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flush()

    expect(switchPage).toHaveBeenCalledWith('/about')
    app.unmount()
  })

  it('shows recents first when the query is empty', async () => {
    localStorage.setItem('mechanica:recent-pages', JSON.stringify(['/blog/post']))
    const { el, app } = mount()
    await flush()

    const first = el.querySelector('.mech-quick__item')!
    expect(first.textContent).toContain('First post')
    expect(el.querySelector('.mech-quick__group')!.textContent).toBe('Recent')
    app.unmount()
  })
})
