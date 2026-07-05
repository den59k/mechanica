import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h } from 'vue'
import BoxSideInput from '@/editor/composer/components/BoxSideInput.vue'

beforeEach(() => {
  document.body.innerHTML = ''
})

function mount(initial: unknown, opts: { min?: number; label?: string } = {}) {
  const state = { value: initial }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () =>
      h(BoxSideInput, {
        modelValue: state.value,
        min: opts.min,
        label: opts.label ?? 'padding',
        'onUpdate:modelValue': (v: number | number[]) => (state.value = v),
      }),
  })
  app.mount(host)
  return { host, state }
}

const flush = () => new Promise((resolve) => setTimeout(resolve))
const field = (host: HTMLElement, label: string) =>
  host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
const type = (input: HTMLInputElement, value: string) => {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('BoxSideInput', () => {
  it('lays out the four sides from a [t, r, b, l] value where they act', () => {
    const { host } = mount([10, 20, 30, 40])
    expect(field(host, 'Top padding').value).toBe('10')
    expect(field(host, 'Right padding').value).toBe('20')
    expect(field(host, 'Bottom padding').value).toBe('30')
    expect(field(host, 'Left padding').value).toBe('40')
  })

  it('expands a single number to all four sides', () => {
    const { host } = mount(16)
    for (const side of ['Top', 'Right', 'Bottom', 'Left'])
      expect(field(host, `${side} padding`).value).toBe('16')
  })

  it('emits the collapsed value when a side changes', async () => {
    const { host, state } = mount(16)
    type(field(host, 'Top padding'), '24')
    await flush()
    expect(state.value).toEqual([24, 16, 16, 16])
  })

  it('allows negative sides for margin (no min)', async () => {
    const { host, state } = mount(0, { label: 'margin' })
    type(field(host, 'Left margin'), '-12')
    await flush()
    expect(state.value).toEqual([0, 0, 0, -12])
  })

  it('clamps a side to the min for padding', async () => {
    const { host, state } = mount(0, { min: 0 })
    type(field(host, 'Top padding'), '-8')
    await flush()
    expect(state.value).toBe(0) // clamped to 0 → collapses back to a single 0
  })

  it('scrubs a side by dragging the field horizontally', async () => {
    const { host, state } = mount(16)
    const input = field(host, 'Top padding')
    input.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, button: 0, bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 112, bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    await flush()
    expect(state.value).toEqual([28, 16, 16, 16]) // 16 + 12px of drag
  })
})
