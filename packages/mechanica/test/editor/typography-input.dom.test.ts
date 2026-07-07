import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import TypographyInput from '@/editor/components/TypographyInput.vue'
import { insertAtCursor, NBSP, NB_HYPHEN } from '@/editor/lib/typography'

beforeEach(() => {
  document.body.innerHTML = ''
})

function mount(props: Record<string, unknown>) {
  const emitted: string[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(TypographyInput, { ...props, 'onUpdate:modelValue': (v: string) => emitted.push(v) }),
  })
  app.mount(host)
  return { host, emitted }
}

describe('insertAtCursor', () => {
  it('replaces the selection and leaves the caret after the inserted char', () => {
    const el = document.createElement('input')
    el.value = 'abcd'
    el.setSelectionRange(1, 3) // select "bc"
    const next = insertAtCursor(el, NBSP)
    expect(next).toBe(`a${NBSP}d`)
    expect(el.selectionStart).toBe(2) // caret right after the nbsp
  })
})

describe('TypographyInput', () => {
  it('renders a marker span for a non-breaking space in the overlay', () => {
    const { host } = mount({ modelValue: `на${NBSP}тебе` })
    const marker = host.querySelector('.mech-typo__nbsp')
    expect(marker).not.toBeNull()
    expect(marker!.textContent).toBe(NBSP)
  })

  it('renders a marker span for a non-breaking hyphen', () => {
    const { host } = mount({ modelValue: `из${NB_HYPHEN}за` })
    expect(host.querySelector('.mech-typo__nbhyphen')).not.toBeNull()
  })

  it('shows no markers for plain text', () => {
    const { host } = mount({ modelValue: 'plain-text here' })
    expect(host.querySelector('.mech-typo__nbsp, .mech-typo__nbhyphen')).toBeNull()
  })

  it('renders a textarea when multiline', () => {
    const { host } = mount({ multiline: true, modelValue: 'x' })
    expect(host.querySelector('textarea')).not.toBeNull()
    expect(host.querySelector('input')).toBeNull()
  })

  it('inserts a non-breaking space at the caret on Ctrl+Shift+Space', async () => {
    const { host, emitted } = mount({ modelValue: 'ab' })
    const input = host.querySelector('input')!
    input.focus()
    input.setSelectionRange(1, 1)
    input.dispatchEvent(
      new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, code: 'Space', bubbles: true, cancelable: true }),
    )
    await nextTick()
    expect(emitted.at(-1)).toBe(`a${NBSP}b`)
  })
})
