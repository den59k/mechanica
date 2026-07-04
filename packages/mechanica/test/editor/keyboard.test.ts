import { describe, it, expect } from 'vitest'
import { shortcutChar } from '@/editor/lib/keyboard'

describe('shortcutChar', () => {
  it('returns the Latin letter for a US-QWERTY layout', () => {
    expect(shortcutChar({ key: 'r', code: 'KeyR' })).toBe('r')
    expect(shortcutChar({ key: 'Z', code: 'KeyZ' })).toBe('z') // Shift held → uppercase key
  })

  it('falls back to the physical key under a non-Latin layout', () => {
    // Russian layout: the physical Z/D/K keys emit Cyrillic characters.
    expect(shortcutChar({ key: 'я', code: 'KeyZ' })).toBe('z')
    expect(shortcutChar({ key: 'в', code: 'KeyD' })).toBe('d')
    expect(shortcutChar({ key: 'л', code: 'KeyK' })).toBe('k')
  })

  it('trusts the Latin letter over the code (relocated Latin layouts)', () => {
    // AZERTY: the key labelled Z sits at the physical KeyW position, but still
    // emits 'z' — honour what the user sees.
    expect(shortcutChar({ key: 'z', code: 'KeyW' })).toBe('z')
  })

  it('resolves digits, preferring the character then the code', () => {
    expect(shortcutChar({ key: '1', code: 'Digit1' })).toBe('1')
    expect(shortcutChar({ key: '!', code: 'Digit1' })).toBe('1') // Shift+1
  })

  it('returns null for keys that are not shortcut characters', () => {
    expect(shortcutChar({ key: 'Escape', code: 'Escape' })).toBeNull()
    expect(shortcutChar({ key: 'ArrowDown', code: 'ArrowDown' })).toBeNull()
    expect(shortcutChar({ key: ' ', code: 'Space' })).toBeNull()
    expect(shortcutChar({ key: 'Enter' })).toBeNull() // no code available
  })
})
