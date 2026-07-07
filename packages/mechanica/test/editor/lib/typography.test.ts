import { describe, it, expect } from 'vitest'
import {
  NBSP,
  NB_HYPHEN,
  typographyCharForEvent,
  highlightTypographyHtml,
  typographyParser,
  hasTypographyChar,
} from '@/editor/lib/typography'

const ev = (e: Partial<KeyboardEvent>) => e as KeyboardEvent

describe('typographyCharForEvent', () => {
  it('maps Ctrl+Shift+Space to a non-breaking space', () => {
    expect(typographyCharForEvent(ev({ ctrlKey: true, shiftKey: true, code: 'Space' }))).toBe(NBSP)
  })

  it('maps Cmd+Shift+Minus to a non-breaking hyphen', () => {
    expect(typographyCharForEvent(ev({ metaKey: true, shiftKey: true, code: 'Minus' }))).toBe(NB_HYPHEN)
  })

  it('requires Shift and a modifier, and rejects Alt', () => {
    expect(typographyCharForEvent(ev({ ctrlKey: true, code: 'Space' }))).toBeNull() // no Shift
    expect(typographyCharForEvent(ev({ shiftKey: true, code: 'Space' }))).toBeNull() // no Ctrl/Cmd
    expect(typographyCharForEvent(ev({ ctrlKey: true, shiftKey: true, altKey: true, code: 'Space' }))).toBeNull()
    expect(typographyCharForEvent(ev({ ctrlKey: true, shiftKey: true, code: 'KeyA' }))).toBeNull()
  })
})

describe('highlightTypographyHtml', () => {
  it('HTML-escapes before wrapping so markup in the value is inert', () => {
    expect(highlightTypographyHtml('a<b>&')).toBe('a&lt;b&gt;&amp;')
  })

  it('wraps a non-breaking space in a marker span (keeping the char)', () => {
    const html = highlightTypographyHtml(`на${NBSP}тебе`)
    expect(html).toBe(`на<span class="mech-typo__nbsp">${NBSP}</span>тебе`)
  })

  it('wraps a non-breaking hyphen in a marker span', () => {
    const html = highlightTypographyHtml(`из${NB_HYPHEN}за`)
    expect(html).toContain('class="mech-typo__nbhyphen"')
    expect(html).toContain(NB_HYPHEN)
  })
})

describe('typographyParser', () => {
  it('emits a one-char span per non-breaking character with correct offsets', () => {
    expect(typographyParser(`a${NBSP}b`)).toEqual([{ start: 1, end: 2, style: 'nbsp' }])
    expect(typographyParser(`x${NB_HYPHEN}y`)).toEqual([{ start: 1, end: 2, style: 'nbHyphen' }])
  })

  it('handles a mix in order', () => {
    expect(typographyParser(`${NBSP}${NB_HYPHEN}`)).toEqual([
      { start: 0, end: 1, style: 'nbsp' },
      { start: 1, end: 2, style: 'nbHyphen' },
    ])
  })

  it('returns nothing for plain text', () => {
    expect(typographyParser('plain text')).toEqual([])
  })
})

describe('hasTypographyChar', () => {
  it('detects either non-breaking character', () => {
    expect(hasTypographyChar(`a${NBSP}b`)).toBe(true)
    expect(hasTypographyChar(`a${NB_HYPHEN}b`)).toBe(true)
    expect(hasTypographyChar('a-b c')).toBe(false)
  })
})
