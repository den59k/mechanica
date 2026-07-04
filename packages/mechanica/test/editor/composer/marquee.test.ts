import { describe, it, expect } from 'vitest'
import { marqueeRect, rectsIntersect } from '@/editor/composer/lib/marquee'

describe('marqueeRect', () => {
  it('normalizes a top-left → bottom-right drag', () => {
    expect(marqueeRect(10, 20, 40, 60)).toEqual({ left: 10, top: 20, width: 30, height: 40 })
  })
  it('normalizes a bottom-right → top-left drag (negative delta)', () => {
    expect(marqueeRect(40, 60, 10, 20)).toEqual({ left: 10, top: 20, width: 30, height: 40 })
  })
})

describe('rectsIntersect', () => {
  const a = { left: 0, top: 0, width: 100, height: 100 }
  it('detects overlap', () => {
    expect(rectsIntersect(a, { left: 50, top: 50, width: 100, height: 100 })).toBe(true)
    expect(rectsIntersect(a, { left: 20, top: 20, width: 10, height: 10 })).toBe(true) // contained
  })
  it('rejects separated rects', () => {
    expect(rectsIntersect(a, { left: 200, top: 0, width: 10, height: 10 })).toBe(false)
    expect(rectsIntersect(a, { left: 0, top: 300, width: 10, height: 10 })).toBe(false)
  })
  it('treats a touching edge as non-intersecting', () => {
    expect(rectsIntersect(a, { left: 100, top: 0, width: 10, height: 10 })).toBe(false)
  })
})
