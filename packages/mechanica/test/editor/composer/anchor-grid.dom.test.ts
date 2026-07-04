import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h } from 'vue'
import AnchorGrid from '@/editor/composer/components/AnchorGrid.vue'

beforeEach(() => {
  document.body.innerHTML = ''
})

function mount(initial: string) {
  const state = { value: initial }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () =>
      h(AnchorGrid, {
        modelValue: state.value,
        'onUpdate:modelValue': (v: string) => (state.value = v),
      }),
  })
  app.mount(host)
  return { host, state }
}

const flush = () => new Promise((resolve) => setTimeout(resolve))

describe('AnchorGrid', () => {
  it('renders the nine anchor cells in reading order', () => {
    const { host } = mount('top-left')
    const cells = host.querySelectorAll<HTMLElement>('.mech-composer__anchorcell')
    expect(cells).toHaveLength(9)
    expect([...cells].map((c) => c.getAttribute('aria-label'))).toEqual([
      'Top left', 'Top center', 'Top right',
      'Middle left', 'Center', 'Middle right',
      'Bottom left', 'Bottom center', 'Bottom right',
    ])
  })

  it('marks the active cell for the current anchor', () => {
    const { host } = mount('center')
    const active = host.querySelectorAll('.mech-composer__anchorcell.is-active')
    expect(active).toHaveLength(1)
    expect(active[0]!.getAttribute('aria-label')).toBe('Center')
  })

  it('emits the picked anchor on click', async () => {
    const { host, state } = mount('top-left')
    const cells = host.querySelectorAll<HTMLElement>('.mech-composer__anchorcell')
    // The middle-right edge-centre is one of the anchors the redesign added.
    cells[5]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(state.value).toBe('right')
  })
})
