import { describe, it, expect } from 'vitest'
import type { ContentBlock } from 'mechanica-shared'
import { OPTIONAL_PROPS, optionalProp, propPresent, availableProps } from '@/editor/composer/lib/inspector-props'

const node = (data: Record<string, unknown>): ContentBlock => ({ id: 'n1', blockId: 'mech:frame', data })

describe('availableProps', () => {
  it('offers frame properties to frames only', () => {
    const frame = availableProps('frame', false).map((p) => p.key)
    expect(frame).toEqual(['padding', 'margin', 'limits', 'background', 'radius', 'position'])
    const text = availableProps('text', false).map((p) => p.key)
    expect(text).toEqual(['margin', 'limits', 'position'])
    const image = availableProps('image', false).map((p) => p.key)
    expect(image).toEqual(['margin', 'limits', 'radius', 'position'])
  })

  it('excludes position for the root frame (the root *is* the block)', () => {
    const root = availableProps('frame', true).map((p) => p.key)
    expect(root).not.toContain('position')
    expect(root).toContain('padding')
  })

  it('returns nothing for non-element blocks without the component flag', () => {
    expect(availableProps(null, false)).toEqual([])
  })

  it('offers only placement props (margin + position) to a placed component', () => {
    const comp = availableProps(null, false, true).map((p) => p.key)
    expect(comp).toEqual(['margin', 'position'])
  })
})

describe('propPresent', () => {
  const padding = optionalProp('padding')!
  const position = optionalProp('position')!

  it('detects a key in the base data', () => {
    expect(propPresent(node({ padding: [64, 24] }), padding)).toBe(true)
    expect(propPresent(node({ padding: 0 }), padding)).toBe(true) // falsy values still count
    expect(propPresent(node({}), padding)).toBe(false)
  })

  it('detects a key that only exists in a $bp layer', () => {
    expect(propPresent(node({ $bp: { sm: { padding: 12 } } }), padding)).toBe(true)
  })

  it('maps position to the $abs key', () => {
    expect(propPresent(node({ $abs: { anchor: 'top-left', x: 0, y: 0 } }), position)).toBe(true)
    expect(propPresent(node({}), position)).toBe(false)
  })
})

describe('registry integrity', () => {
  it('every prop resolves by key', () => {
    for (const p of OPTIONAL_PROPS) expect(optionalProp(p.key)).toBe(p)
    expect(optionalProp('nope')).toBeNull()
  })
})
