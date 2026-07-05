import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h, ref } from 'vue'
import BoxSideInput from '@/editor/composer/components/BoxSideInput.vue'
import { composerStoreKey } from '@/editor/composer/lib/keys'

beforeEach(() => {
  document.body.innerHTML = ''
})

function mount(initial: unknown, opts: { min?: number; label?: string } = {}) {
  // A ref so edits flow back into modelValue and the field re-renders — needed to
  // chain edits (e.g. the Alt-mirror test edits two sides in sequence).
  const state = ref(initial)
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

  it('signals the touched side to the store, for the canvas echo', async () => {
    const store: { spacing: unknown } = { spacing: null }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({ render: () => h(BoxSideInput, { modelValue: 10, label: 'margin' }) })
    app.provide(composerStoreKey, store as never)
    app.mount(host)

    const input = host.querySelector<HTMLInputElement>('input[aria-label="Top margin"]')!
    input.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
    await flush()
    expect(store.spacing).toEqual({ prop: 'margin', side: 't', symmetric: false })

    // Alt while hovering → symmetric, so the canvas can also light the opposite side.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }))
    await flush()
    expect(store.spacing).toEqual({ prop: 'margin', side: 't', symmetric: true })
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', altKey: false }))

    host.querySelector('.mech-composer__box')!.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }))
    await flush()
    expect(store.spacing).toBeNull()
  })

  it('mirrors an edit to the opposite side while Alt is held', async () => {
    const { host, state } = mount(10)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }))
    type(field(host, 'Top padding'), '40') // top + bottom → 40; left/right stay 10
    await flush()
    expect(state.value).toEqual([40, 10])
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', altKey: false }))
    // Alt released → a later edit touches only its own side.
    type(field(host, 'Left padding'), '4')
    await flush()
    expect(state.value).toEqual([40, 10, 40, 4])
  })
})
