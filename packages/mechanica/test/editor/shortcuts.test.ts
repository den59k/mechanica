import { describe, it, expect } from 'vitest'
import { resolveShortcut, type ShortcutEvent } from '@/editor/shortcuts'

const ev = (e: Partial<ShortcutEvent>): ShortcutEvent => ({
  key: '',
  typing: false,
  hasSelection: false,
  ...e,
})

describe('resolveShortcut', () => {
  it('maps undo / redo', () => {
    expect(resolveShortcut(ev({ key: 'z', metaKey: true }))).toBe('undo')
    expect(resolveShortcut(ev({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe('redo')
    expect(resolveShortcut(ev({ key: 'y', ctrlKey: true }))).toBe('redo')
  })

  it('maps delete / duplicate only with a selection', () => {
    expect(resolveShortcut(ev({ key: 'Delete', hasSelection: true }))).toBe('delete')
    expect(resolveShortcut(ev({ key: 'Backspace', hasSelection: true }))).toBe('delete')
    expect(resolveShortcut(ev({ key: 'd', ctrlKey: true, hasSelection: true }))).toBe('duplicate')
    expect(resolveShortcut(ev({ key: 'Delete', hasSelection: false }))).toBeNull()
  })

  it('always allows Escape but suppresses others while typing', () => {
    expect(resolveShortcut(ev({ key: 'Escape', typing: true }))).toBe('deselect')
    expect(resolveShortcut(ev({ key: 'z', metaKey: true, typing: true }))).toBeNull()
    expect(resolveShortcut(ev({ key: 'Delete', hasSelection: true, typing: true }))).toBeNull()
  })
})
