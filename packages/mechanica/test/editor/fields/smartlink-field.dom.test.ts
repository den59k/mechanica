import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h } from 'vue'
import FieldControl from '@/editor/fields/FieldControl.vue'
import { registerBuiltinFieldEditors } from '@/editor/fields/builtin'
import { clearFieldEditors } from '@/editor/fields/registry'
import type { PageItem } from '@/editor/lib/page-list'

const PAGES: PageItem[] = [
  { path: '/', name: 'Home' },
  { path: '/docs', name: 'Docs' },
  { path: '/pricing', name: 'Pricing' },
]

beforeEach(() => {
  clearFieldEditors()
  registerBuiltinFieldEditors()
  document.body.innerHTML = ''
})

function mountSmartLink(initial: unknown) {
  const state = { value: initial }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () =>
      h(FieldControl, {
        modelValue: state.value,
        schema: { type: 'object', format: 'smartLink' },
        'onUpdate:modelValue': (v: unknown) => (state.value = v),
      }),
  })
  app.provide('mechPages', PAGES)
  app.mount(host)
  return { host, state }
}

const flush = () => new Promise((resolve) => setTimeout(resolve))
const type = (input: HTMLInputElement, text: string) => {
  input.value = text
  input.dispatchEvent(new Event('input'))
}

describe('smartLink field (page combobox)', () => {
  it('searches pages and selects an internal one, auto-filling the title', async () => {
    const { host, state } = mountSmartLink({ url: '', title: '' })
    const input = host.querySelector('.mech-smartlink__input') as HTMLInputElement
    input.dispatchEvent(new Event('focus'))
    type(input, 'doc')
    await flush()

    const options = [...document.querySelectorAll('.mech-smartlink__option')]
    const docs = options.find((o) => o.textContent?.includes('/docs'))!
    expect(docs).toBeTruthy()
    docs.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(state.value).toMatchObject({ url: '/docs', title: 'Docs', external: false })
    // menu closes after choosing (re-render is async)
    await flush()
    expect(document.querySelector('.mech-smartlink__menu')).toBeNull()
  })

  it('falls back to an external link, flagging external automatically', async () => {
    const { host, state } = mountSmartLink({ url: '', title: '' })
    const input = host.querySelector('.mech-smartlink__input') as HTMLInputElement
    input.dispatchEvent(new Event('focus'))
    type(input, 'https://example.com')
    await flush()

    const ext = document.querySelector('.mech-smartlink__option--ext')!
    expect(ext).toBeTruthy()
    ext.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(state.value).toMatchObject({ url: 'https://example.com', external: true })
  })

  it('commits the active option on Enter', async () => {
    const { host, state } = mountSmartLink({ url: '', title: '' })
    const input = host.querySelector('.mech-smartlink__input') as HTMLInputElement
    input.dispatchEvent(new Event('focus'))
    type(input, 'pricing')
    await flush()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))

    expect(state.value).toMatchObject({ url: '/pricing', title: 'Pricing', external: false })
  })

  it('shows the kind badge and clears the link', async () => {
    const { host, state } = mountSmartLink({ url: '/docs', title: 'Docs', external: false })
    expect(host.querySelector('.mech-smartlink__kind')?.textContent?.trim()).toBe('Page')

    host.querySelector('.mech-smartlink__clear')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(state.value).toMatchObject({ url: '', title: '' })
  })

  it('keeps extra settings collapsed until the more button is clicked', async () => {
    const { host, state } = mountSmartLink({ url: '/docs', title: 'Docs', external: false })
    // collapsed by default for a plain internal link
    expect(host.querySelector('.mech-smartlink__options')).toBeNull()

    host.querySelector('.mech-smartlink__more')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(host.querySelector('.mech-smartlink__options')).not.toBeNull()

    const checkbox = host.querySelector('.mech-smartlink__newtab input') as HTMLInputElement
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
    expect(state.value).toMatchObject({ openNewTab: true })
  })

  it('reveals extra settings by default when the link opens in a new tab', () => {
    const { host } = mountSmartLink({ url: '/docs', title: 'Docs', external: false, openNewTab: true })
    expect(host.querySelector('.mech-smartlink__options')).not.toBeNull()
  })
})
