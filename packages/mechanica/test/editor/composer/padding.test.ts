import { describe, it, expect } from 'vitest'
import { parsePadding, collapsePadding, setSide, computePaddingDrag } from '@/editor/composer/lib/padding'

describe('parsePadding', () => {
  it('expands a scalar to all sides', () => {
    expect(parsePadding(24)).toEqual({ t: 24, r: 24, b: 24, l: 24 })
  })
  it('expands [y, x]', () => {
    expect(parsePadding([96, 24])).toEqual({ t: 96, r: 24, b: 96, l: 24 })
  })
  it('expands [t, r, b, l]', () => {
    expect(parsePadding([1, 2, 3, 4])).toEqual({ t: 1, r: 2, b: 3, l: 4 })
  })
  it('expands the CSS 3-value form [t, r/l, b]', () => {
    expect(parsePadding([1, 2, 3])).toEqual({ t: 1, r: 2, b: 3, l: 2 })
  })
  it('defaults undefined / garbage to zero', () => {
    expect(parsePadding(undefined)).toEqual({ t: 0, r: 0, b: 0, l: 0 })
    expect(parsePadding('nope')).toEqual({ t: 0, r: 0, b: 0, l: 0 })
  })
})

describe('collapsePadding', () => {
  it('collapses equal sides to a scalar', () => {
    expect(collapsePadding({ t: 24, r: 24, b: 24, l: 24 })).toBe(24)
  })
  it('collapses symmetric sides to [y, x]', () => {
    expect(collapsePadding({ t: 96, r: 24, b: 96, l: 24 })).toEqual([96, 24])
  })
  it('keeps [t, r, b, l] when asymmetric', () => {
    expect(collapsePadding({ t: 1, r: 2, b: 3, l: 4 })).toEqual([1, 2, 3, 4])
  })
})

describe('setSide (one side at a time) collapses to the shortest form', () => {
  it('a single-side change from a scalar yields the full form', () => {
    // Only top changes → no longer symmetric, so all four sides are explicit.
    expect(setSide(24, 't', 96)).toEqual([96, 24, 24, 24])
  })
  it('collapses back to a scalar when every side re-equalizes', () => {
    expect(setSide([24, 24, 96, 24], 'b', 24)).toBe(24)
  })
  it('produces the full form for an asymmetric edit', () => {
    expect(setSide([96, 24], 'l', 40)).toEqual([96, 24, 96, 40])
  })
})

describe('computePaddingDrag', () => {
  const start = { t: 64, r: 24, b: 64, l: 24 }

  it('adds the delta to the dragged side only, rounding + clamping', () => {
    expect(computePaddingDrag(start, 't', 10.4)).toEqual({ t: 74, r: 24, b: 64, l: 24 })
    expect(computePaddingDrag(start, 'l', -100)).toEqual({ t: 64, r: 24, b: 64, l: 0 }) // clamp ≥ 0
  })

  it('mirrors the same value to the opposite side when symmetric (Alt)', () => {
    // top → top & bottom take the SAME value; left/right untouched
    expect(computePaddingDrag(start, 't', 10, { symmetric: true })).toEqual({ t: 74, r: 24, b: 74, l: 24 })
    // right → right & left take the same value
    expect(computePaddingDrag(start, 'r', 6, { symmetric: true })).toEqual({ t: 64, r: 30, b: 64, l: 30 })
  })

  it('snaps the value to the grid when snap is set (Shift)', () => {
    expect(computePaddingDrag(start, 't', 3, { snap: 4 })).toEqual({ t: 68, r: 24, b: 64, l: 24 }) // 67 → 68
    expect(computePaddingDrag(start, 't', 3, { symmetric: true, snap: 4 })).toEqual({ t: 68, r: 24, b: 68, l: 24 })
  })
})
