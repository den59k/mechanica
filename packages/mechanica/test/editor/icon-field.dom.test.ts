import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h } from 'vue'
import IconField from '@/editor/components/IconField.vue'

beforeEach(() => {
  document.body.innerHTML = ''
})

function mount(initial: string) {
  const state = { value: initial }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () =>
      h(IconField, { modelValue: state.value, 'onUpdate:modelValue': (v: string) => (state.value = v) }),
  })
  app.mount(host)
  return { host, state }
}

const flush = () => new Promise((resolve) => setTimeout(resolve))
const trigger = (host: HTMLElement) => host.querySelector('.mech-iconfield__trigger') as HTMLElement

describe('IconField', () => {
  it('shows the current icon name and stays closed at rest', () => {
    const { host } = mount('trash')
    expect(trigger(host).textContent).toContain('trash')
    expect(document.querySelector('.mech-iconfield__grid')).toBeNull()
  })

  it('opens a grid of icons on click, marking the current one selected', async () => {
    const { host } = mount('trash')
    trigger(host).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    const cells = document.querySelectorAll('.mech-iconfield__cell')
    expect(cells.length).toBeGreaterThan(10) // the whole icon set
    expect(document.querySelector('.mech-iconfield__cell.is-selected')?.getAttribute('aria-label')).toBe('trash')
  })

  it('filters the grid by search text', async () => {
    const { host } = mount('trash')
    trigger(host).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    const search = document.querySelector('.mech-iconfield__search input') as HTMLInputElement
    search.value = 'trash'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    const labels = [...document.querySelectorAll('.mech-iconfield__cell')].map((c) => c.getAttribute('aria-label'))
    expect(labels).toEqual(['trash'])
  })

  it('picks an icon, emitting it and closing the popover', async () => {
    const { host, state } = mount('frame')
    trigger(host).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    const search = document.querySelector('.mech-iconfield__search input') as HTMLInputElement
    search.value = 'image'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    ;(document.querySelector('.mech-iconfield__cell') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(state.value).toBe('image')
    expect(document.querySelector('.mech-iconfield__grid')).toBeNull() // closed
  })

  it('clears the icon via the Clear action', async () => {
    const { host, state } = mount('trash')
    trigger(host).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    ;(document.querySelector('.mech-iconfield__clear') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(state.value).toBe('')
  })
})
