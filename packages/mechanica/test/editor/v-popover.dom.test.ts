import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, ref, type App } from 'vue'
import VPopover from '@/editor/components/VPopover.vue'

const flush = () => new Promise((resolve) => setTimeout(resolve))
let app: App | null = null

afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
})

function mountPopover() {
  const anchor = document.createElement('button')
  anchor.className = 'anchor'
  document.body.appendChild(anchor)
  const open = ref(true)
  app = createApp({
    render: () =>
      h(
        VPopover,
        {
          open: open.value,
          anchor,
          panelClass: 'test-menu',
          'onUpdate:open': (v: boolean) => (open.value = v),
        },
        { default: () => h('div', { class: 'content' }, 'hi') },
      ),
  })
  const host = document.createElement('div')
  document.body.appendChild(host)
  app.mount(host)
  return { open, anchor }
}

describe('VPopover', () => {
  it('teleports the panel (with its panel-class + slot content) while open', async () => {
    mountPopover()
    await flush()
    const panel = document.querySelector('.mech-popover.test-menu')
    expect(panel).not.toBeNull()
    expect(panel!.querySelector('.content')?.textContent).toBe('hi')
  })

  it('requests close on an outside pointerdown, but not when clicking the anchor', async () => {
    const { open, anchor } = mountPopover()
    await flush()

    anchor.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(open.value).toBe(true) // the anchor counts as "inside"

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(open.value).toBe(false)
  })

  it('closes on Escape', async () => {
    const { open } = mountPopover()
    await flush()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(open.value).toBe(false)
  })
})
