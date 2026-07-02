import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import type { Block } from 'vuewrite'
import RichTextEditor from '@/editor/fields/richtext/RichTextEditor.vue'
import {
  allRichTextWidgets,
  clearRegisteredWidgets,
  registerRichTextWidgets,
  type RichTextWidget,
} from '@/editor/fields/richtext/widgets'

beforeEach(() => clearRegisteredWidgets())
afterEach(() => vi.restoreAllMocks())

const widget = (overrides: Partial<RichTextWidget> = {}): RichTextWidget => ({
  type: 'cta',
  title: 'CTA button',
  icon: '<svg viewBox="0 0 24 24"></svg>',
  create: () => ({ type: 'cta', editable: false }),
  ...overrides,
})

describe('registerRichTextWidgets', () => {
  it('appends site widgets after the built-ins', () => {
    registerRichTextWidgets([widget()])
    const types = allRichTextWidgets().map((w) => w.type)
    expect(types).toEqual(['img', 'code', 'callout', 'cta'])
  })

  it('skips duplicates of built-in, reserved and already-registered types', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerRichTextWidgets([
      widget({ type: 'img' }), // built-in
      widget({ type: 'h2' }), // reserved core type
      widget({ type: 'cta' }),
      widget({ type: 'cta' }), // duplicate of the line above
    ])
    expect(allRichTextWidgets().filter((w) => w.type === 'cta')).toHaveLength(1)
    expect(allRichTextWidgets().filter((w) => w.type === 'img')).toHaveLength(1)
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('rejects malformed definitions instead of breaking the editor', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerRichTextWidgets([{ title: 'nope' } as unknown as RichTextWidget])
    expect(allRichTextWidgets()).toHaveLength(3)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('normalizes hard-coded colors in raw-svg icons to currentColor', () => {
    registerRichTextWidgets([widget({ icon: '<svg><path fill="#1A2B3C" stroke="white"/></svg>' })])
    const registered = allRichTextWidgets().find((w) => w.type === 'cta')!
    expect(registered.icon).toBe('<svg><path fill="currentColor" stroke="currentColor"/></svg>')
  })
})

function mountEditor(blocks: Block[]) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({
    render: () => h(RichTextEditor, { modelValue: blocks, toolbar: true }),
  })
  app.mount(el)
  return { el, app }
}

describe('RichTextEditor widget slots', () => {
  it('renders a registered widget block through its editing component', () => {
    registerRichTextWidgets([
      widget({
        editor: defineComponent({
          props: { block: { type: Object, required: true } },
          render() {
            return h('div', { class: 'cta-editor-marker' }, String((this.block as Block & { label?: string }).label))
          },
        }),
      }),
    ])
    const { el, app } = mountEditor([
      { id: '1', text: 'Hello' },
      { id: '2', text: '', type: 'cta', editable: false, label: 'Get started' } as Block,
    ])
    expect(el.querySelector('.cta-editor-marker')?.textContent).toBe('Get started')
    app.unmount()
  })

  it('still renders the built-in image widget through the dynamic slots', () => {
    const { el, app } = mountEditor([{ id: '1', text: '', type: 'img', editable: false, src: '' } as Block])
    expect(el.querySelector('.mech-rt-image')).toBeTruthy()
    app.unmount()
  })

  it('lists registered widgets in the Insert menu', async () => {
    registerRichTextWidgets([widget()])
    const { el, app } = mountEditor([{ id: '1', text: 'Hello' }])
    ;(el.querySelector('button[title="Insert"]') as HTMLButtonElement).click()
    await nextTick()
    // VPopover teleports to body.
    const items = [...document.body.querySelectorAll('.mech-rte__insert-item')]
    expect(items.map((b) => b.textContent?.trim())).toContain('CTA button')
    app.unmount()
  })

  it('contains a broken widget behind the error boundary', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerRichTextWidgets([
      widget({
        editor: defineComponent({
          setup() {
            throw new Error('widget exploded')
          },
        }),
      }),
    ])
    const { el, app } = mountEditor([
      { id: '1', text: 'Still alive' },
      { id: '2', text: '', type: 'cta', editable: false } as Block,
    ])
    await nextTick() // the boundary's error flag re-renders on the next tick
    expect(el.querySelector('.mech-rte-broken')?.textContent).toContain('CTA button')
    expect(el.textContent).toContain('Still alive') // the rest of the document survives
    expect(error).toHaveBeenCalled()
    app.unmount()
    warn.mockRestore()
  })
})
