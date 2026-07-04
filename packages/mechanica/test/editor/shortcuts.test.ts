import { describe, it, expect } from 'vitest'
import { resolveShortcut, type ShortcutEvent } from '@/editor/lib/shortcuts'

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

  it('maps copy / cut / paste', () => {
    expect(resolveShortcut(ev({ key: 'c', metaKey: true, hasSelection: true }))).toBe('copy')
    expect(resolveShortcut(ev({ key: 'x', ctrlKey: true, hasSelection: true }))).toBe('cut')
    expect(resolveShortcut(ev({ key: 'v', ctrlKey: true }))).toBe('paste') // paste needs no selection
    expect(resolveShortcut(ev({ key: 'c', metaKey: true, hasSelection: false }))).toBeNull()
  })

  it('always allows Escape but suppresses others while typing', () => {
    expect(resolveShortcut(ev({ key: 'Escape', typing: true }))).toBe('deselect')
    expect(resolveShortcut(ev({ key: 'z', metaKey: true, typing: true }))).toBeNull()
    expect(resolveShortcut(ev({ key: 'Delete', hasSelection: true, typing: true }))).toBeNull()
  })

  it('opens the quick switcher with mod+K — even while typing', () => {
    expect(resolveShortcut(ev({ key: 'k', ctrlKey: true }))).toBe('quickSwitch')
    expect(resolveShortcut(ev({ key: 'K', metaKey: true, typing: true }))).toBe('quickSwitch')
    expect(resolveShortcut(ev({ key: 'k' }))).toBeNull()
  })

  it('fires on the physical key under a non-Latin layout', () => {
    // Russian layout emits Cyrillic chars; the physical key (code) still matches.
    expect(resolveShortcut(ev({ key: 'я', code: 'KeyZ', metaKey: true }))).toBe('undo')
    expect(resolveShortcut(ev({ key: 'л', code: 'KeyK', ctrlKey: true }))).toBe('quickSwitch')
    expect(resolveShortcut(ev({ key: 'в', code: 'KeyD', ctrlKey: true, hasSelection: true }))).toBe('duplicate')
    expect(resolveShortcut(ev({ key: 'с', code: 'KeyC', metaKey: true, hasSelection: true }))).toBe('copy')
  })
})
