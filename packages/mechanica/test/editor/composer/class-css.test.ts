import { describe, it, expect } from 'vitest'
import { selectorTargets, resolveVars, parseDeclarations, rgbToHex } from '@/editor/composer/lib/class-css'

describe('rgbToHex', () => {
  it('rewrites bare rgb() to #hex (the CSSOM canonicalizes authored hex to rgb)', () => {
    expect(rgbToHex('rgb(238, 240, 246)')).toBe('#eef0f6')
    expect(rgbToHex('rgb(0, 115, 233)')).toBe('#0073e9')
  })

  it('rewrites rgb() inside a compound value', () => {
    expect(rgbToHex('1px solid rgb(232, 233, 240)')).toBe('1px solid #e8e9f0')
  })

  it('leaves rgba() and non-color values untouched', () => {
    expect(rgbToHex('rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)')
    expect(rgbToHex('auto')).toBe('auto')
    expect(rgbToHex('var(--surface)')).toBe('var(--surface)')
  })
})

describe('parseDeclarations', () => {
  it('keeps authored shorthands and splits on top-level ; / :', () => {
    expect(parseDeclarations('width: 100%; max-width: var(--container); margin-inline: auto;')).toEqual([
      { prop: 'width', value: '100%' },
      { prop: 'max-width', value: 'var(--container)' },
      { prop: 'margin-inline', value: 'auto' },
    ])
  })

  it('does not split on ; / : nested inside parentheses', () => {
    expect(parseDeclarations('border: 1px solid var(--border); background: url(data:image/svg;base64,AA)')).toEqual([
      { prop: 'border', value: '1px solid var(--border)' },
      { prop: 'background', value: 'url(data:image/svg;base64,AA)' },
    ])
  })
})

describe('selectorTargets', () => {
  it('matches an exact class selector, incl. inside a comma list', () => {
    expect(selectorTargets('.ds-container', '.ds-container')).toBe(true)
    expect(selectorTargets('.a, .ds-container, .b', '.ds-container')).toBe(true)
  })

  it('rejects pseudo / descendant / compound selectors (base rule only)', () => {
    expect(selectorTargets('.ds-container:hover', '.ds-container')).toBe(false)
    expect(selectorTargets('.card .ds-container', '.ds-container')).toBe(false)
    expect(selectorTargets('.ds-container.other', '.ds-container')).toBe(false)
  })
})

describe('resolveVars', () => {
  const root = {
    getPropertyValue: (name: string) =>
      ({ '--container': ' 1140px', '--border': '#e8e9f0' })[name] ?? '',
  }

  it('leaves var-free values untouched', () => {
    expect(resolveVars('auto', root)).toBe('auto')
    expect(resolveVars('32px', root)).toBe('32px')
  })

  it('substitutes a single token and within a compound value', () => {
    expect(resolveVars('var(--container)', root)).toBe('1140px')
    expect(resolveVars('1px solid var(--border)', root)).toBe('1px solid #e8e9f0')
  })

  it('falls back to the declared fallback, then the raw token, when unresolved', () => {
    expect(resolveVars('var(--missing, 12px)', root)).toBe('12px')
    expect(resolveVars('var(--missing)', root)).toBe('var(--missing)')
  })
})
